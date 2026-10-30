"""Train the small Archon pilot from random initialization."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import random
import time
from typing import Any

import torch
from torch.nn import functional as F

from .config import ModelConfig, load_json
from .data_pipeline import load_and_split
from .model import ArchonDecoder
from .tokenizer import ByteBPE


ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = ROOT.parent


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def digest_json(payload: Any) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

def digest_texts(texts: list[str]) -> str:
    payload = "\n".join(texts).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def pack_texts(texts: list[str], tokenizer: ByteBPE) -> torch.Tensor:
    tokens: list[int] = []
    for text in texts:
        tokens.extend(tokenizer.encode(text))
    return torch.tensor(tokens, dtype=torch.long)


def sample_batch(
    tokens: torch.Tensor,
    batch_size: int,
    context_length: int,
    device: torch.device,
) -> tuple[torch.Tensor, torch.Tensor]:
    maximum_start = len(tokens) - context_length - 1
    if maximum_start < 0:
        raise ValueError("Training split is shorter than context_length + 1 tokens.")
    starts = torch.randint(0, maximum_start + 1, (batch_size,))
    inputs = torch.stack([tokens[start : start + context_length] for start in starts])
    targets = torch.stack(
        [tokens[start + 1 : start + context_length + 1] for start in starts]
    )
    return inputs.to(device), targets.to(device)


@torch.no_grad()
def evaluate_loss(
    model: ArchonDecoder,
    tokens: torch.Tensor,
    context_length: int,
    device: torch.device,
) -> dict[str, float | int]:
    if len(tokens) < 2:
        raise ValueError("Evaluation split has too few tokens.")
    was_training = model.training
    model.eval()
    total_loss = 0.0
    target_count = 0
    for start in range(0, len(tokens) - 1, context_length):
        sequence_length = min(context_length, len(tokens) - 1 - start)
        inputs = tokens[start : start + sequence_length].unsqueeze(0).to(device)
        targets = tokens[start + 1 : start + sequence_length + 1].unsqueeze(0).to(device)
        logits = model(inputs)
        total_loss += F.cross_entropy(
            logits.reshape(-1, logits.shape[-1]),
            targets.reshape(-1),
            reduction="sum",
        ).item()
        target_count += targets.numel()
    model.train(was_training)
    mean_loss = total_loss / target_count
    return {
        "target_tokens": target_count,
        "cross_entropy_nats_per_token": mean_loss,
        "perplexity": math.exp(mean_loss),
    }


def save_checkpoint(
    path: Path,
    model: ArchonDecoder,
    optimizer: torch.optim.Optimizer,
    global_step: int,
    checkpoint_metadata: dict[str, Any],
) -> None:
    inference_path = path.parent / "inference.pt"
    inference_path.unlink(missing_ok=True)
    payload = {
        **checkpoint_metadata,
        "global_step": global_step,
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict(),
        "python_random_state": random.getstate(),
        "torch_random_state": torch.get_rng_state(),
    }
    temporary = path.with_suffix(path.suffix + ".tmp")
    torch.save(payload, temporary)
    os.replace(temporary, path)

    inference_payload = {
        "format": "archon-pilot-inference-v1",
        "global_step": global_step,
        "training_digest": checkpoint_metadata["training_digest"],
        "tokenizer_sha256": checkpoint_metadata["tokenizer_sha256"],
        "model_config": checkpoint_metadata["model_config"],
        "model_state": model.state_dict(),
    }
    inference_temporary = inference_path.with_suffix(inference_path.suffix + ".tmp")
    torch.save(inference_payload, inference_temporary)
    os.replace(inference_temporary, inference_path)


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else REPOSITORY_ROOT / path


def train(arguments: argparse.Namespace) -> dict[str, Any]:
    config_path = resolve_path(arguments.config)
    config_document = load_json(config_path)
    data_config = config_document["data"]
    source_path = resolve_path(data_config["path"])
    splits = load_and_split(
        source_path,
        seed=config_document["seed"],
        train_fraction=data_config["train_fraction"],
        validation_fraction=data_config["validation_fraction"],
        test_fraction=data_config["test_fraction"],
    )

    run_directory = resolve_path(arguments.run_dir)
    checkpoint_path = run_directory / "last.pt"
    tokenizer_path = run_directory / "tokenizer.json"
    if checkpoint_path.exists() and not arguments.resume:
        raise FileExistsError(
            f"{checkpoint_path} already exists. Choose another run directory or pass --resume."
        )
    if arguments.resume:
        if not checkpoint_path.exists() or not tokenizer_path.exists():
            raise FileNotFoundError("Cannot resume without last.pt and tokenizer.json.")
        tokenizer = ByteBPE.load(tokenizer_path)
    else:
        tokenizer = ByteBPE.train(
            splits.train,
            vocab_size=config_document["tokenizer_vocab_target"],
        )
        tokenizer.save(tokenizer_path)

    model_values = config_document["model"]
    model_config = ModelConfig(
        layers=model_values["layers"],
        hidden_size=model_values["hidden_size"],
        intermediate_size=model_values["intermediate_size"],
        attention_heads=model_values["attention_heads"],
        key_value_heads=model_values["key_value_heads"],
        head_dimension=model_values["head_dimension"],
        vocabulary_size=tokenizer.vocab_size,
        context_length=model_values["context_length"],
    )
    model_config.validate()
    training = dict(config_document["training"])
    if arguments.steps is not None:
        training["steps"] = arguments.steps
    if arguments.device is not None:
        training["device"] = arguments.device
    if arguments.threads is not None:
        training["threads"] = arguments.threads
    if training["steps"] < 1 or training["batch_size"] < 1:
        raise ValueError("Training steps and batch size must be positive.")
    if training["checkpoint_every"] < 1:
        raise ValueError("checkpoint_every must be positive.")

    device = torch.device(training["device"])
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available.")
    if device.type != "cpu":
        raise ValueError("This pilot currently supports CPU only for reproducibility.")
    torch.set_num_threads(training["threads"])
    torch.use_deterministic_algorithms(True)

    training_digest = digest_json(
        {
            "seed": config_document["seed"],
            "model": model_values,
            "training": training,
            "data": data_config,
            "corpus_sha256": splits.corpus_sha256,
            "split_sha256": {
                "train": digest_texts(splits.train),
                "validation": digest_texts(splits.validation),
                "test": digest_texts(splits.test),
            },
            "tokenizer": tokenizer.to_dict(),
        }
    )
    random.seed(config_document["seed"])
    torch.manual_seed(config_document["seed"])
    model = ArchonDecoder(model_config).to(device)
    if model.parameter_count() != model_config.parameter_count():
        raise AssertionError(
            f"Implemented parameter count {model.parameter_count()} disagrees with "
            f"configuration count {model_config.parameter_count()}."
        )
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=training["learning_rate"],
        weight_decay=training["weight_decay"],
    )

    train_tokens = pack_texts(splits.train, tokenizer)
    validation_tokens = pack_texts(splits.validation, tokenizer)
    test_tokens = pack_texts(splits.test, tokenizer)
    if len(validation_tokens) < 2 or len(test_tokens) < 2:
        raise ValueError("Validation and test partitions need at least two tokens each.")

    checkpoint_metadata = {
        "training_digest": training_digest,
        "corpus_sha256": splits.corpus_sha256,
        "tokenizer_sha256": hashlib.sha256(
            tokenizer_path.read_bytes()
        ).hexdigest(),
        "model_config": model_config.__dict__,
        "training_config": training,
    }
    start_step = 0
    if arguments.resume:
        try:
            checkpoint = torch.load(
                checkpoint_path,
                map_location=device,
                weights_only=False,
            )
        except TypeError:
            checkpoint = torch.load(checkpoint_path, map_location=device)
        if checkpoint["training_digest"] != training_digest:
            raise ValueError("Resume config, tokenizer, seed, or corpus does not match.")
        model.load_state_dict(checkpoint["model_state"])
        optimizer.load_state_dict(checkpoint["optimizer_state"])
        start_step = int(checkpoint["global_step"])
        random.setstate(checkpoint["python_random_state"])
        torch.set_rng_state(checkpoint["torch_random_state"])

    run_directory.mkdir(parents=True, exist_ok=True)
    validation_at_run_start = evaluate_loss(
        model,
        validation_tokens,
        model_config.context_length,
        device,
    )
    manifest = {
        "project": "Archon independent pilot",
        "status": "small random-initialization pilot",
        "seed": config_document["seed"],
        "corpus_path": source_path.relative_to(REPOSITORY_ROOT).as_posix(),
        "corpus_sha256": splits.corpus_sha256,
        "license_note": "Original project-authored fixture; owner-confirmed CC0 1.0.",
        "split_counts": {
            "train_documents": len(splits.train),
            "validation_documents": len(splits.validation),
            "test_documents": len(splits.test),
            "train_tokens": len(train_tokens),
            "validation_tokens": len(validation_tokens),
            "test_tokens": len(test_tokens),
        },
        "split_sha256": {
            "train": digest_texts(splits.train),
            "validation": digest_texts(splits.validation),
            "test": digest_texts(splits.test),
        },
        "tokenizer_training_partition": "train-only",
        "tokenizer": tokenizer.to_dict(),
        "model_config": model_config.__dict__,
        "parameter_count": model.parameter_count(),
        "training_config": training,
        "torch_version": torch.__version__,
        "python_version": platform.python_version(),
        "hardware": {
            "machine": platform.machine(),
            "logical_cpu_count": os.cpu_count(),
            "torch_threads": training["threads"],
            "cuda_available": torch.cuda.is_available(),
        },
        "device": str(device),
        "training_digest": training_digest,
    }
    write_json(run_directory / "manifest.json", manifest)

    started = time.perf_counter()
    for step in range(start_step + 1, training["steps"] + 1):
        model.train()
        inputs, targets = sample_batch(
            train_tokens,
            training["batch_size"],
            model_config.context_length,
            device,
        )
        logits = model(inputs)
        loss = F.cross_entropy(logits.reshape(-1, tokenizer.vocab_size), targets.reshape(-1))
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        if step % training["checkpoint_every"] == 0 or step == training["steps"]:
            save_checkpoint(
                checkpoint_path,
                model,
                optimizer,
                step,
                checkpoint_metadata,
            )

    elapsed_seconds = time.perf_counter() - started
    steps_this_run = max(0, training["steps"] - start_step)
    validation_metrics = evaluate_loss(
        model,
        validation_tokens,
        model_config.context_length,
        device,
    )
    test_metrics = evaluate_loss(
        model,
        test_tokens,
        model_config.context_length,
        device,
    )
    report = {
        **manifest,
        "completed_steps": training["steps"],
        "steps_this_run": steps_this_run,
        "elapsed_training_seconds": elapsed_seconds,
        "training_tokens_per_second_estimate": (
            steps_this_run
            * training["batch_size"]
            * model_config.context_length
            / max(elapsed_seconds, 1e-9)
        ),
        "validation": validation_metrics,
        "validation_at_run_start": validation_at_run_start,
        "test": test_metrics,
        "limitations": [
            "This is a small training-pipeline pilot, not a useful language model.",
            "The project-authored corpus is tiny and synthetic; metrics are not general benchmarks.",
            "No broad pretraining corpus, GPU, or full-scale training run was used.",
            "No Anchor math is inferred or integrated into the language-model objective.",
        ],
    }
    write_json(run_directory / "evaluation.json", report)
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="archon/configs/pilot.json")
    parser.add_argument("--run-dir", default="archon/runs/pilot")
    parser.add_argument("--steps", type=int, help="Override total optimizer steps.")
    parser.add_argument("--device", choices=("cpu",), help="Override the configured device.")
    parser.add_argument("--threads", type=int, help="Override the configured CPU thread count.")
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    result = train(arguments)
    print(
        json.dumps(
            {
                "status": result["status"],
                "completed_steps": result["completed_steps"],
                "parameter_count": result["parameter_count"],
                "split_counts": result["split_counts"],
                "validation_at_run_start": result["validation_at_run_start"],
                "validation": result["validation"],
                "test": result["test"],
                "elapsed_training_seconds": result["elapsed_training_seconds"],
                "report_path": str(
                    resolve_path(arguments.run_dir) / "evaluation.json"
                ),
            },
            indent=2,
            sort_keys=True,
        )
    )
