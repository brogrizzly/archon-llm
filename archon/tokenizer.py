"""Small, independently trained byte-level BPE tokenizer for the pilot."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable


BYTE_VOCAB_SIZE = 256
BOS_ID = 256
EOS_ID = 257
FIRST_MERGE_ID = 258


def _merge_pair(sequence: list[int], left: int, right: int, merged: int) -> list[int]:
    output: list[int] = []
    index = 0
    while index < len(sequence):
        if (
            index + 1 < len(sequence)
            and sequence[index] == left
            and sequence[index + 1] == right
        ):
            output.append(merged)
            index += 2
        else:
            output.append(sequence[index])
            index += 1
    return output


@dataclass
class ByteBPE:
    """A deterministic byte-BPE vocabulary with no external tokenizer assets."""

    merges: list[tuple[int, int, int]]
    token_bytes: list[bytes]

    @classmethod
    def train(cls, texts: Iterable[str], vocab_size: int) -> "ByteBPE":
        if vocab_size < FIRST_MERGE_ID:
            raise ValueError("vocab_size must include the 256 bytes and two special IDs.")
        sequences = [list(text.encode("utf-8")) for text in texts if text]
        if not sequences:
            raise ValueError("Tokenizer training requires non-empty training text.")

        token_bytes = [bytes([value]) for value in range(BYTE_VOCAB_SIZE)]
        token_bytes.extend((b"", b""))
        merges: list[tuple[int, int, int]] = []
        while FIRST_MERGE_ID + len(merges) < vocab_size:
            frequencies: Counter[tuple[int, int]] = Counter()
            for sequence in sequences:
                frequencies.update(zip(sequence, sequence[1:]))
            if not frequencies:
                break
            best_pair, count = min(
                frequencies.items(),
                key=lambda item: (-item[1], item[0]),
            )
            if count < 2:
                break

            merged_id = FIRST_MERGE_ID + len(merges)
            left, right = best_pair
            merges.append((left, right, merged_id))
            token_bytes.append(token_bytes[left] + token_bytes[right])
            sequences = [
                _merge_pair(sequence, left, right, merged_id)
                for sequence in sequences
            ]
        return cls(merges=merges, token_bytes=token_bytes)

    @property
    def vocab_size(self) -> int:
        return FIRST_MERGE_ID + len(self.merges)

    def encode(self, text: str) -> list[int]:
        tokens = list(text.encode("utf-8"))
        for left, right, merged in self.merges:
            tokens = _merge_pair(tokens, left, right, merged)
        return [BOS_ID, *tokens, EOS_ID]

    def decode(self, tokens: Iterable[int]) -> str:
        output = bytearray()
        for token in tokens:
            if token in (BOS_ID, EOS_ID):
                continue
            if token < 0 or token >= len(self.token_bytes):
                raise ValueError(f"Token ID {token} is outside this tokenizer's vocabulary.")
            output.extend(self.token_bytes[token])
        return output.decode("utf-8", errors="replace")

    def to_dict(self) -> dict[str, object]:
        return {
            "format": "archon-byte-bpe-v1",
            "vocab_size": self.vocab_size,
            "bos_id": BOS_ID,
            "eos_id": EOS_ID,
            "merges": [list(merge) for merge in self.merges],
        }

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(self.to_dict(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path) -> "ByteBPE":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("format") != "archon-byte-bpe-v1":
            raise ValueError("Unsupported tokenizer format.")
        merges = [tuple(int(part) for part in merge) for merge in payload["merges"]]
        if any(len(merge) != 3 for merge in merges):
            raise ValueError("Invalid merge entry.")
        token_bytes = [bytes([value]) for value in range(BYTE_VOCAB_SIZE)]
        token_bytes.extend((b"", b""))
        for expected_id, (left, right, merged) in enumerate(merges, FIRST_MERGE_ID):
            if merged != expected_id or left >= merged or right >= merged:
                raise ValueError("Tokenizer merges are not in canonical training order.")
            token_bytes.append(token_bytes[left] + token_bytes[right])
        tokenizer = cls(merges=merges, token_bytes=token_bytes)
        if payload.get("vocab_size") != tokenizer.vocab_size:
            raise ValueError("Tokenizer vocabulary size does not match its merges.")
        return tokenizer
