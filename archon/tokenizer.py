"""Small, independently trained byte-level BPE tokenizer for the pilot."""

from __future__ import annotations

import codecs
from collections import Counter
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable


BYTE_VOCAB_SIZE = 256
BOS_ID = 256
EOS_ID = 257
FIRST_MERGE_ID = 258

UTF8_BYTE_FORMAT = "archon-utf8-bytes-v1"
UTF8_BYTE_BOS_ID = 256
UTF8_BYTE_EOS_ID = 257
UTF8_BYTE_ALPHABET_SIZE = 258


def _validate_byte_limit(max_bytes: int | None) -> None:
    if max_bytes is not None and (
        isinstance(max_bytes, bool) or not isinstance(max_bytes, int)
    ):
        raise TypeError("max_bytes must be a non-negative integer or None.")
    if max_bytes is not None and max_bytes < 0:
        raise ValueError("max_bytes must be non-negative.")


class Utf8ByteCodec:
    """Versioned, strict UTF-8 byte codec with explicit BOS/EOS framing."""

    format = UTF8_BYTE_FORMAT
    bos_id = UTF8_BYTE_BOS_ID
    eos_id = UTF8_BYTE_EOS_ID
    alphabet_size = UTF8_BYTE_ALPHABET_SIZE
    vocab_size = UTF8_BYTE_ALPHABET_SIZE

    def encode(self, text: str, *, max_bytes: int | None = None) -> list[int]:
        """Encode text without normalization, enforcing an optional byte limit."""
        _validate_byte_limit(max_bytes)
        if not isinstance(text, str):
            raise TypeError("text must be a string.")
        raw = text.encode("utf-8", errors="strict")
        if max_bytes is not None and len(raw) > max_bytes:
            raise ValueError(f"Text exceeds the {max_bytes}-byte limit.")
        return [self.bos_id, *raw, self.eos_id]

    def decode(
        self, token_ids: Iterable[int], *, max_bytes: int | None = None
    ) -> str:
        """Decode one fully framed sequence, rejecting invalid or incomplete UTF-8."""
        decoder = self.stream_decoder(max_bytes=max_bytes)
        text = decoder.feed(token_ids)
        decoder.finish()
        return text

    def stream_decoder(
        self, *, max_bytes: int | None = None
    ) -> Utf8ByteStreamDecoder:
        """Create a strict incremental decoder for this codec's byte IDs."""
        return Utf8ByteStreamDecoder(max_bytes=max_bytes)

    def to_dict(self) -> dict[str, object]:
        """Return the stable codec description used to identify this format."""
        return {
            "format": self.format,
            "byte_id_min": 0,
            "byte_id_max": 255,
            "bos_id": self.bos_id,
            "eos_id": self.eos_id,
            "alphabet_size": self.alphabet_size,
            "normalization": "none",
            "decode_errors": "strict",
        }

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(self.to_dict(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path) -> "Utf8ByteCodec":
        payload = json.loads(path.read_text(encoding="utf-8"))
        codec = cls()
        if payload != codec.to_dict():
            raise ValueError("Unsupported or mismatched UTF-8 byte codec format.")
        return codec


class Utf8ByteStreamDecoder:
    """Incrementally decode framed byte IDs, buffering partial UTF-8 sequences."""

    def __init__(self, *, max_bytes: int | None = None) -> None:
        _validate_byte_limit(max_bytes)
        self.max_bytes = max_bytes
        self._decoder = codecs.getincrementaldecoder("utf-8")(errors="strict")
        self._started = False
        self._completed = False
        self._utf8_finalized = False
        self._byte_count = 0

    def _finalize_utf8(self) -> str:
        if self._utf8_finalized:
            return ""
        result = self._decoder.decode(b"", final=True)
        self._utf8_finalized = True
        return result

    def feed(self, token_ids: Iterable[int]) -> str:
        """Consume any available IDs and return newly decoded text.

        A UTF-8 character may span calls to ``feed``. Its text is returned only
        after all of its bytes have arrived.
        """
        output: list[str] = []
        for token_id in token_ids:
            if isinstance(token_id, bool) or not isinstance(token_id, int):
                raise ValueError(f"Invalid token ID: {token_id!r}.")
            if self._completed:
                raise ValueError("Token IDs cannot follow EOS.")

            if not self._started:
                if token_id != UTF8_BYTE_BOS_ID:
                    raise ValueError("A byte sequence must begin with BOS.")
                self._started = True
                if self.max_bytes == 0:
                    output.append(self._finalize_utf8())
                continue

            if token_id == UTF8_BYTE_EOS_ID:
                output.append(self._finalize_utf8())
                self._completed = True
                continue
            if token_id == UTF8_BYTE_BOS_ID:
                raise ValueError("Unexpected BOS inside a byte sequence.")
            if token_id < 0 or token_id > 255:
                raise ValueError(
                    f"Token ID {token_id} is outside the byte codec alphabet."
                )
            if self._utf8_finalized:
                raise ValueError(f"Text exceeds the {self.max_bytes}-byte limit.")
            if self.max_bytes is not None and self._byte_count >= self.max_bytes:
                raise ValueError(f"Text exceeds the {self.max_bytes}-byte limit.")

            output.append(self._decoder.decode(bytes((token_id,)), final=False))
            self._byte_count += 1
            if self.max_bytes is not None and self._byte_count == self.max_bytes:
                # A hard limit is a completed byte boundary: pending UTF-8 is
                # not allowed to remain incomplete while the stream waits.
                output.append(self._finalize_utf8())

        return "".join(output)

    def finish(self, *, require_eos: bool = True) -> None:
        """Validate final UTF-8 and, by default, require an EOS boundary."""
        if self._completed:
            return
        if not self._started:
            raise ValueError("A byte sequence must begin with BOS.")
        self._finalize_utf8()
        if require_eos:
            raise ValueError("A completed byte sequence must end with EOS.")


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

    format = "archon-byte-bpe-v1"
    bos_id = BOS_ID
    eos_id = EOS_ID
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
            "format": self.format,
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


TextCodec = ByteBPE | Utf8ByteCodec


def codec_metadata(codec: TextCodec) -> dict[str, int | str]:
    """Return the checkpoint identity that binds weights to their text format."""
    return {
        "format": codec.format,
        "bos_id": codec.bos_id,
        "eos_id": codec.eos_id,
        "vocab_size": codec.vocab_size,
    }


def load_text_codec(path: Path) -> TextCodec:
    """Load the codec declared by a tokenizer file; reject unknown formats."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    codec_format = payload.get("format") if isinstance(payload, dict) else None
    if codec_format == ByteBPE.format:
        return ByteBPE.load(path)
    if codec_format == Utf8ByteCodec.format:
        return Utf8ByteCodec.load(path)
    raise ValueError("Unsupported tokenizer format.")
