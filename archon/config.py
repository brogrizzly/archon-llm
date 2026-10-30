"""Model configuration and explicit candidate parameter accounting."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ModelConfig:
    layers: int
    hidden_size: int
    intermediate_size: int
    attention_heads: int
    key_value_heads: int
    head_dimension: int
    vocabulary_size: int
    context_length: int
    rope_base: float = 10_000.0
    rms_norm_eps: float = 1e-6

    def validate(self) -> None:
        positive_values = (
            self.layers,
            self.hidden_size,
            self.intermediate_size,
            self.attention_heads,
            self.key_value_heads,
            self.head_dimension,
            self.vocabulary_size,
            self.context_length,
        )
        if any(value <= 0 for value in positive_values):
            raise ValueError("All model dimensions must be positive.")
        if self.hidden_size != self.attention_heads * self.head_dimension:
            raise ValueError("hidden_size must equal attention_heads × head_dimension.")
        if self.attention_heads % self.key_value_heads != 0:
            raise ValueError("attention_heads must be divisible by key_value_heads.")
        if self.head_dimension % 2:
            raise ValueError("RoPE requires an even head_dimension.")
        if self.rope_base <= 0 or self.rms_norm_eps <= 0:
            raise ValueError("RoPE base and RMSNorm epsilon must be positive.")

    def parameter_count(self) -> int:
        """Count trainable weights for tied embeddings and bias-free projections."""
        self.validate()
        attention = self.hidden_size * (
            self.attention_heads * self.head_dimension
            + 2 * self.key_value_heads * self.head_dimension
            + self.attention_heads * self.head_dimension
        )
        swiglu = 3 * self.hidden_size * self.intermediate_size
        norms = self.layers * 2 * self.hidden_size + self.hidden_size
        tied_embeddings = self.vocabulary_size * self.hidden_size
        return self.layers * (attention + swiglu + 2 * self.hidden_size) + self.hidden_size + tied_embeddings


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def candidate_config(path: Path) -> tuple[ModelConfig, int, dict[str, Any]]:
    document = load_json(path)
    raw = document["architecture"]
    config = ModelConfig(
        layers=raw["layers"],
        hidden_size=raw["hidden_size"],
        intermediate_size=raw["intermediate_size"],
        attention_heads=raw["attention_heads"],
        key_value_heads=raw["key_value_heads"],
        head_dimension=raw["head_dimension"],
        vocabulary_size=raw["vocabulary_size"],
        context_length=raw["context_length"],
    )
    config.validate()
    return config, raw["claimed_parameters"], document
