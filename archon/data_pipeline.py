"""Deterministic corpus loading, splitting, and content digests."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path


@dataclass(frozen=True)
class CorpusSplits:
    train: list[str]
    validation: list[str]
    test: list[str]
    corpus_sha256: str


def load_and_split(
    path: Path,
    seed: int,
    train_fraction: float,
    validation_fraction: float,
    test_fraction: float,
) -> CorpusSplits:
    if any(fraction <= 0 for fraction in (train_fraction, validation_fraction, test_fraction)):
        raise ValueError("Every corpus split must have a positive fraction.")
    if abs(train_fraction + validation_fraction + test_fraction - 1.0) > 1e-9:
        raise ValueError("Train, validation, and test fractions must sum to one.")
    raw_bytes = path.read_bytes()
    records = [
        line.strip()
        for line in raw_bytes.decode("utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if len(records) < 10:
        raise ValueError("Pilot corpus must contain at least ten non-empty records.")
    if len(set(records)) != len(records):
        raise ValueError("Duplicate corpus records are not allowed in the pilot.")

    ordered = sorted(
        enumerate(records),
        key=lambda item: hashlib.sha256(
            f"{seed}:{item[0]}:{item[1]}".encode("utf-8")
        ).hexdigest(),
    )
    train_count = max(1, int(len(ordered) * train_fraction))
    validation_count = max(1, int(len(ordered) * validation_fraction))
    if train_count + validation_count >= len(ordered):
        raise ValueError("Corpus is too small for non-empty validation and test splits.")
    train_records = ordered[:train_count]
    validation_records = ordered[train_count : train_count + validation_count]
    test_records = ordered[train_count + validation_count :]

    return CorpusSplits(
        train=[record for _, record in train_records],
        validation=[record for _, record in validation_records],
        test=[record for _, record in test_records],
        corpus_sha256=hashlib.sha256(raw_bytes).hexdigest(),
    )
