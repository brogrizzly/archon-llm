"""Run a controlled, small-pilot comparison of the byte and byte-BPE codecs."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from .config import load_json
from .train import REPOSITORY_ROOT, resolve_path, train, write_json


CODEC_RUNS = {
    "utf8-bytes": "utf8-bytes",
    "byte-bpe": "byte-bpe",
}
REPORT_FORMAT = "archon-codec-comparison-v1"
MODEL_SETTINGS_EXCLUDED_FROM_COMPARISON = {"vocabulary_size"}


def _shared_model_settings(report: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in report["model_config"].items()
        if key not in MODEL_SETTINGS_EXCLUDED_FROM_COMPARISON
    }


def _comparison_run(report: dict[str, Any]) -> dict[str, Any]:
    fields = (
        "text_codec",
        "split_counts",
        "tokenizer_sha256",
        "model_config",
        "parameter_count",
        "training_config",
        "completed_steps",
        "elapsed_training_seconds",
        "validation_at_run_start",
        "validation",
        "test",
    )
    comparison_run = {field: report[field] for field in fields}
    comparison_run["training_positions_per_second_estimate"] = report[
        "training_tokens_per_second_estimate"
    ]
    return comparison_run


def _evaluation_delta(
    bpe_metrics: dict[str, Any], byte_metrics: dict[str, Any]
) -> dict[str, float]:
    return {
        metric: bpe_metrics[metric] - byte_metrics[metric]
        for metric in ("cross_entropy_nats_per_token", "perplexity")
    }


def _display_path(path: Path) -> str:
    try:
        return path.relative_to(REPOSITORY_ROOT).as_posix()
    except ValueError:
        return str(path)


def compare_codecs(
    *,
    config: str = "archon/configs/pilot.json",
    run_dir: str = "archon/runs/codec-comparison",
    steps: int | None = None,
    device: str | None = None,
    threads: int | None = None,
) -> dict[str, Any]:
    """Train both codecs from scratch and write a machine-readable comparison."""
    config_path = resolve_path(config)
    config_document = load_json(config_path)
    comparison_directory = resolve_path(run_dir)
    comparison_path = comparison_directory / "comparison.json"
    if comparison_path.exists():
        raise FileExistsError(
            f"{comparison_path} already exists. Choose another comparison directory."
        )
    for codec_name in CODEC_RUNS:
        codec_directory = comparison_directory / codec_name
        if codec_directory.exists() and (
            not codec_directory.is_dir() or any(codec_directory.iterdir())
        ):
            raise FileExistsError(
                f"{codec_directory} is not empty. Choose a fresh comparison directory."
            )

    run_reports: dict[str, dict[str, Any]] = {}
    for codec_name, codec_argument in CODEC_RUNS.items():
        arguments = argparse.Namespace(
            config=str(config_path),
            run_dir=str(comparison_directory / codec_name),
            steps=steps,
            device=device,
            threads=threads,
            tokenizer_format=codec_argument,
            resume=False,
        )
        run_reports[codec_name] = train(arguments)

    byte_report = run_reports["utf8-bytes"]
    bpe_report = run_reports["byte-bpe"]
    shared_settings = {
        "seed": config_document["seed"],
        "corpus_path": byte_report["corpus_path"],
        "corpus_sha256": byte_report["corpus_sha256"],
        "split_sha256": byte_report["split_sha256"],
        "split_document_counts": {
            key: value
            for key, value in byte_report["split_counts"].items()
            if key.endswith("_documents")
        },
        "model_settings_except_vocabulary_size": _shared_model_settings(byte_report),
        "training_config": byte_report["training_config"],
        "environment": {
            "device": byte_report["device"],
            "hardware": byte_report["hardware"],
            "python_version": byte_report["python_version"],
            "torch_version": byte_report["torch_version"],
        },
    }
    if (
        byte_report["corpus_sha256"] != bpe_report["corpus_sha256"]
        or byte_report["split_sha256"] != bpe_report["split_sha256"]
        or shared_settings["split_document_counts"]
        != {
            key: value
            for key, value in bpe_report["split_counts"].items()
            if key.endswith("_documents")
        }
        or _shared_model_settings(byte_report) != _shared_model_settings(bpe_report)
        or byte_report["training_config"] != bpe_report["training_config"]
        or byte_report["seed"] != bpe_report["seed"]
        or any(
            byte_report[field] != bpe_report[field]
            for field in ("device", "hardware", "python_version", "torch_version")
        )
    ):
        raise AssertionError("Codec runs do not share the same pilot conditions.")

    byte_counts = byte_report["split_counts"]
    bpe_counts = bpe_report["split_counts"]
    report = {
        "format": REPORT_FORMAT,
        "title": "UTF-8 byte vs. byte-BPE small pilot comparison",
        "scope": (
            "Small pilot comparison only, not a general benchmark or a language "
            "quality result."
        ),
        "config_path": _display_path(config_path),
        "config_sha256": hashlib.sha256(config_path.read_bytes()).hexdigest(),
        "shared_settings": shared_settings,
        "runs": {
            codec_name: _comparison_run(run_report)
            for codec_name, run_report in run_reports.items()
        },
        "comparison": {
            "token_count_delta_byte_bpe_minus_utf8_bytes": {
                split: bpe_counts[f"{split}_tokens"] - byte_counts[f"{split}_tokens"]
                for split in ("train", "validation", "test")
            },
            "train_token_reduction_percent_with_byte_bpe": (
                100.0
                * (byte_counts["train_tokens"] - bpe_counts["train_tokens"])
                / byte_counts["train_tokens"]
            ),
            "elapsed_training_seconds_delta_byte_bpe_minus_utf8_bytes": (
                bpe_report["elapsed_training_seconds"]
                - byte_report["elapsed_training_seconds"]
            ),
            "evaluation_metric_delta_byte_bpe_minus_utf8_bytes": {
                "validation": _evaluation_delta(
                    bpe_report["validation"], byte_report["validation"]
                ),
                "test": _evaluation_delta(bpe_report["test"], byte_report["test"]),
            },
        },
        "limitations": [
            "The corpus is tiny, synthetic, and project-authored.",
            "The models differ in output vocabulary size, which affects parameter count and the meaning of per-token metrics.",
            "Training time and throughput cover the optimizer/checkpoint loop only; they exclude tokenizer fitting, model initialization, and evaluation.",
            "Training time and throughput are single-run CPU observations, not stable hardware benchmarks.",
            "Throughput is estimated model positions per second (steps × batch size × context length), not unique corpus tokens per second.",
            "Each run starts from random initialization with the same configured seed and optimizer settings.",
            "The tokenizer is trained on the training partition only; validation and test text are held out.",
        ],
        "report_path": _display_path(comparison_path),
    }
    write_json(comparison_path, report)
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="archon/configs/pilot.json")
    parser.add_argument("--run-dir", default="archon/runs/codec-comparison")
    parser.add_argument("--steps", type=int, help="Override total optimizer steps.")
    parser.add_argument("--device", choices=("cpu",), help="Override the configured device.")
    parser.add_argument("--threads", type=int, help="Override the configured CPU thread count.")
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    result = compare_codecs(
        config=arguments.config,
        run_dir=arguments.run_dir,
        steps=arguments.steps,
        device=arguments.device,
        threads=arguments.threads,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
