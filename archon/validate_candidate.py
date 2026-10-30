"""Check the proposed 2B configuration without allocating model weights."""

from pathlib import Path

import torch

from .config import candidate_config
from .model import ArchonDecoder


ROOT = Path(__file__).resolve().parent


def main() -> int:
    config, claimed, document = candidate_config(ROOT / "configs/candidate-2b.json")
    formula_count = config.parameter_count()
    with torch.device("meta"):
        implementation_count = ArchonDecoder(config).parameter_count()
    print(f"Status: {document['status']}")
    print(f"Configuration: {document['name']}")
    print(f"Context length: {config.context_length}")
    print(f"Tokenizer vocabulary: {config.vocabulary_size}")
    print(f"Formula parameter count:          {formula_count:,}")
    print(f"Model implementation parameter count: {implementation_count:,}")
    print(f"Claimed trainable parameters:    {claimed:,}")
    if formula_count != implementation_count or implementation_count != claimed:
        print("Result: MISMATCH — keep this candidate blocked.")
        return 1
    print("Result: parameter accounting matches; candidate remains unapproved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
