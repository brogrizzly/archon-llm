"""Local greedy inference for an explicitly trained Archon pilot checkpoint."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import torch

from .config import ModelConfig
from .model import ArchonDecoder
from .tokenizer import ByteBPE, EOS_ID


MAX_REQUEST_BYTES = 16_384
MAX_PROMPT_BYTES = 8_192
MAX_NEW_TOKENS = 256


class InferenceFailure(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_inference_model(run_directory: Path) -> tuple[ArchonDecoder, ByteBPE, str]:
    checkpoint_path = run_directory / "inference.pt"
    tokenizer_path = run_directory / "tokenizer.json"
    manifest_path = run_directory / "manifest.json"
    if not all(path.is_file() for path in (checkpoint_path, tokenizer_path, manifest_path)):
        raise InferenceFailure(
            "CHECKPOINT_UNAVAILABLE",
            "No complete inference-ready checkpoint is available for this run.",
        )

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        tokenizer_bytes = tokenizer_path.read_bytes()
        tokenizer = ByteBPE.load(tokenizer_path)
        checkpoint: Any = torch.load(
            checkpoint_path,
            map_location="cpu",
            weights_only=True,
        )
    except Exception as error:
        raise InferenceFailure(
            "INVALID_CHECKPOINT",
            "The local checkpoint, tokenizer, or manifest could not be loaded safely.",
        ) from error

    if (
        not isinstance(manifest, dict)
        or not isinstance(checkpoint, dict)
        or checkpoint.get("format") != "archon-pilot-inference-v1"
    ):
        raise InferenceFailure(
            "INVALID_CHECKPOINT",
            "The local inference checkpoint format is unsupported.",
        )

    tokenizer_digest = hashlib.sha256(tokenizer_bytes).hexdigest()
    if (
        not isinstance(manifest.get("training_digest"), str)
        or checkpoint.get("training_digest") != manifest["training_digest"]
        or checkpoint.get("tokenizer_sha256") != tokenizer_digest
        or manifest.get("tokenizer") != tokenizer.to_dict()
        or checkpoint.get("model_config") != manifest.get("model_config")
        or not isinstance(checkpoint.get("global_step"), int)
        or checkpoint["global_step"] < 1
    ):
        raise InferenceFailure(
            "CHECKPOINT_MISMATCH",
            "Checkpoint, tokenizer, and manifest provenance do not match.",
        )

    try:
        model_config = ModelConfig(**checkpoint["model_config"])
        model_config.validate()
        if (
            model_config.vocabulary_size != tokenizer.vocab_size
            or manifest.get("parameter_count") != model_config.parameter_count()
        ):
            raise ValueError("Checkpoint model dimensions do not match its tokenizer.")
        model = ArchonDecoder(model_config)
        model.load_state_dict(checkpoint["model_state"], strict=True)
        for parameter in model.parameters():
            if not torch.isfinite(parameter).all().item():
                raise ValueError("Checkpoint contains non-finite model weights.")
    except Exception as error:
        raise InferenceFailure(
            "INVALID_CHECKPOINT",
            "Checkpoint weights do not match the declared Archon architecture.",
        ) from error

    model.eval()
    return model, tokenizer, sha256_file(checkpoint_path)


def generate_text(
    model: ArchonDecoder,
    tokenizer: ByteBPE,
    prompt: str,
    max_new_tokens: int,
) -> tuple[str, str]:
    if not isinstance(prompt, str) or not prompt.strip():
        raise InferenceFailure("INVALID_REQUEST", "Prompt must be non-empty text.")
    if len(prompt.encode("utf-8")) > MAX_PROMPT_BYTES:
        raise InferenceFailure("PROMPT_TOO_LARGE", "Prompt exceeds the byte limit.")
    if not isinstance(max_new_tokens, int) or not 1 <= max_new_tokens <= MAX_NEW_TOKENS:
        raise InferenceFailure(
            "INVALID_REQUEST",
            f"max_new_tokens must be between 1 and {MAX_NEW_TOKENS}.",
        )

    input_tokens = tokenizer.encode(prompt)[:-1]
    if len(input_tokens) > model.config.context_length:
        raise InferenceFailure(
            "PROMPT_TOO_LONG",
            "Prompt exceeds the checkpoint context length; it was not truncated.",
        )

    token_ids = torch.tensor([input_tokens], dtype=torch.long)
    generated: list[int] = []
    finish_reason = "max_new_tokens"
    with torch.inference_mode():
        for _ in range(max_new_tokens):
            if token_ids.shape[1] >= model.config.context_length:
                finish_reason = "context_limit"
                break
            next_token = int(model(token_ids)[:, -1, :].argmax(dim=-1).item())
            if next_token == EOS_ID:
                finish_reason = "eos"
                break
            generated.append(next_token)
            token_ids = torch.cat(
                (token_ids, torch.tensor([[next_token]], dtype=torch.long)),
                dim=1,
            )
    return tokenizer.decode(generated), finish_reason


def run_request(run_directory: Path, request: Any) -> dict[str, Any]:
    if (
        not isinstance(request, dict)
        or set(request) != {"prompt", "max_new_tokens"}
        or not isinstance(request.get("prompt"), str)
        or not isinstance(request.get("max_new_tokens"), int)
    ):
        raise InferenceFailure(
            "INVALID_REQUEST",
            "Request must contain exactly prompt and max_new_tokens.",
        )
    model, tokenizer, model_digest = load_inference_model(run_directory)
    text, finish_reason = generate_text(
        model,
        tokenizer,
        request["prompt"],
        request["max_new_tokens"],
    )
    return {
        "ok": True,
        "result": {
            "text": text,
            "model_digest": model_digest,
            "finish_reason": finish_reason,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-dir", required=True)
    arguments = parser.parse_args()
    raw_request = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    if len(raw_request) > MAX_REQUEST_BYTES:
        response = {
            "ok": False,
            "error": {
                "code": "REQUEST_TOO_LARGE",
                "message": "Inference request exceeds the byte limit.",
            },
        }
        print(json.dumps(response, separators=(",", ":")))
        return 2

    try:
        request = json.loads(raw_request.decode("utf-8"))
        response = run_request(Path(arguments.run_dir), request)
    except InferenceFailure as error:
        response = {
            "ok": False,
            "error": {"code": error.code, "message": str(error)},
        }
        print(json.dumps(response, separators=(",", ":")))
        return 2
    except (UnicodeDecodeError, json.JSONDecodeError):
        response = {
            "ok": False,
            "error": {
                "code": "INVALID_REQUEST",
                "message": "Inference request is not valid UTF-8 JSON.",
            },
        }
        print(json.dumps(response, separators=(",", ":")))
        return 2

    print(json.dumps(response, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
