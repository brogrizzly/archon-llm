"""Small decoder-only causal Transformer used by the independent pilot."""

from __future__ import annotations

import math

import torch
from torch import nn
from torch.nn import functional as F

from .config import ModelConfig


class RMSNorm(nn.Module):
    def __init__(self, width: int, epsilon: float) -> None:
        super().__init__()
        self.weight = nn.Parameter(torch.ones(width))
        self.epsilon = epsilon

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        normalized = values * torch.rsqrt(
            values.float().pow(2).mean(dim=-1, keepdim=True) + self.epsilon
        )
        return normalized.to(values.dtype) * self.weight


class RotaryEmbedding(nn.Module):
    def __init__(self, head_dimension: int, base: float) -> None:
        super().__init__()
        inverse_frequency = 1.0 / (
            base
            ** (
                torch.arange(0, head_dimension, 2, dtype=torch.float32)
                / head_dimension
            )
        )
        self.register_buffer("inverse_frequency", inverse_frequency, persistent=False)

    def forward(
        self,
        query: torch.Tensor,
        key: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        positions = torch.arange(query.shape[-2], device=query.device, dtype=torch.float32)
        angles = torch.outer(positions, self.inverse_frequency)
        cosine = angles.cos()[None, None, :, :]
        sine = angles.sin()[None, None, :, :]

        def rotate(values: torch.Tensor) -> torch.Tensor:
            even = values[..., 0::2]
            odd = values[..., 1::2]
            rotated = torch.stack(
                (even * cosine - odd * sine, even * sine + odd * cosine),
                dim=-1,
            )
            return rotated.flatten(-2).to(values.dtype)

        return rotate(query), rotate(key)


class GroupedQueryAttention(nn.Module):
    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        hidden = config.hidden_size
        q_width = config.attention_heads * config.head_dimension
        kv_width = config.key_value_heads * config.head_dimension
        self.attention_heads = config.attention_heads
        self.key_value_heads = config.key_value_heads
        self.head_dimension = config.head_dimension
        self.query_projection = nn.Linear(hidden, q_width, bias=False)
        self.key_projection = nn.Linear(hidden, kv_width, bias=False)
        self.value_projection = nn.Linear(hidden, kv_width, bias=False)
        self.output_projection = nn.Linear(q_width, hidden, bias=False)
        self.rotary = RotaryEmbedding(config.head_dimension, config.rope_base)

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        batch_size, sequence_length, _ = values.shape
        query = self.query_projection(values).view(
            batch_size,
            sequence_length,
            self.attention_heads,
            self.head_dimension,
        ).transpose(1, 2)
        key = self.key_projection(values).view(
            batch_size,
            sequence_length,
            self.key_value_heads,
            self.head_dimension,
        ).transpose(1, 2)
        value = self.value_projection(values).view(
            batch_size,
            sequence_length,
            self.key_value_heads,
            self.head_dimension,
        ).transpose(1, 2)

        query, key = self.rotary(query, key)
        groups = self.attention_heads // self.key_value_heads
        if groups > 1:
            key = key.repeat_interleave(groups, dim=1)
            value = value.repeat_interleave(groups, dim=1)
        attended = F.scaled_dot_product_attention(
            query,
            key,
            value,
            is_causal=True,
        )
        attended = attended.transpose(1, 2).contiguous().view(
            batch_size,
            sequence_length,
            self.attention_heads * self.head_dimension,
        )
        return self.output_projection(attended)


class SwiGLU(nn.Module):
    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.gate_projection = nn.Linear(
            config.hidden_size,
            config.intermediate_size,
            bias=False,
        )
        self.up_projection = nn.Linear(
            config.hidden_size,
            config.intermediate_size,
            bias=False,
        )
        self.down_projection = nn.Linear(
            config.intermediate_size,
            config.hidden_size,
            bias=False,
        )

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        return self.down_projection(
            F.silu(self.gate_projection(values)) * self.up_projection(values)
        )


class TransformerBlock(nn.Module):
    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.attention_norm = RMSNorm(config.hidden_size, config.rms_norm_eps)
        self.attention = GroupedQueryAttention(config)
        self.feed_forward_norm = RMSNorm(config.hidden_size, config.rms_norm_eps)
        self.feed_forward = SwiGLU(config)

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        values = values + self.attention(self.attention_norm(values))
        return values + self.feed_forward(self.feed_forward_norm(values))


class ArchonDecoder(nn.Module):
    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        config.validate()
        self.config = config
        self.token_embedding = nn.Embedding(config.vocabulary_size, config.hidden_size)
        self.blocks = nn.ModuleList(
            TransformerBlock(config) for _ in range(config.layers)
        )
        self.final_norm = RMSNorm(config.hidden_size, config.rms_norm_eps)
        self.output_projection = nn.Linear(
            config.hidden_size,
            config.vocabulary_size,
            bias=False,
        )
        self.output_projection.weight = self.token_embedding.weight

    def forward(self, token_ids: torch.Tensor) -> torch.Tensor:
        if token_ids.ndim != 2:
            raise ValueError("token_ids must have shape [batch, sequence].")
        if token_ids.shape[1] > self.config.context_length:
            raise ValueError("Input exceeds the configured context length.")
        values = self.token_embedding(token_ids)
        for block in self.blocks:
            values = block(values)
        return self.output_projection(self.final_norm(values))

    def parameter_count(self) -> int:
        return sum(parameter.numel() for parameter in self.parameters())
