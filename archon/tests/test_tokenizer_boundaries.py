from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from archon.tokenizer import BOS_ID, EOS_ID, ByteBPE


def byte_only_tokenizer() -> ByteBPE:
    """Create a tokenizer with only the base byte vocabulary."""
    return ByteBPE.train(["seed", "seed"], vocab_size=258)


class ByteBPEBoundaryTests(unittest.TestCase):
    def test_invalid_utf8_byte_sequences_are_rejected(self) -> None:
        tokenizer = byte_only_tokenizer()
        malformed_sequences = (
            b"\x80",       # lone continuation byte
            b"\xc0\xaf",   # overlong encoding
            b"\xe2\x82",   # truncated three-byte sequence
            b"\xe2(\xa1",  # invalid continuation in a three-byte sequence
        )

        for malformed in malformed_sequences:
            with self.subTest(malformed=malformed):
                with self.assertRaises(UnicodeDecodeError):
                    tokenizer.decode(malformed)

    def test_stream_decoder_preserves_a_character_split_across_tokens(self) -> None:
        tokenizer = byte_only_tokenizer()
        decoder = tokenizer.stream_decoder()

        self.assertEqual(decoder.feed([BOS_ID, 0xE2]), "")
        self.assertEqual(decoder.feed([0x82]), "")
        self.assertEqual(decoder.feed([0xAC]), "€")
        self.assertEqual(decoder.feed([EOS_ID]), "")
        decoder.finish()

    def test_stream_decoder_rejects_malformed_and_incomplete_utf8(self) -> None:
        tokenizer = byte_only_tokenizer()

        malformed = tokenizer.stream_decoder()
        malformed.feed([BOS_ID])
        with self.assertRaises(UnicodeDecodeError):
            malformed.feed([0x80])

        incomplete = tokenizer.stream_decoder()
        incomplete.feed([BOS_ID, 0xE2, 0x82])
        with self.assertRaises(UnicodeDecodeError):
            incomplete.feed([EOS_ID])

    def test_unpaired_surrogate_is_rejected_by_text_encoder(self) -> None:
        tokenizer = byte_only_tokenizer()
        with self.assertRaises(UnicodeEncodeError):
            tokenizer.encode("\ud800")

    def test_empty_text_round_trips_as_only_reserved_tokens(self) -> None:
        tokenizer = byte_only_tokenizer()
        encoded = tokenizer.encode("")

        self.assertEqual(encoded, [BOS_ID, EOS_ID])
        self.assertEqual(tokenizer.decode(encoded), "")

    def test_repetitive_text_merges_deterministically_and_round_trips(self) -> None:
        text = "abcabc" * 16
        tokenizer = ByteBPE.train([text, text], vocab_size=300)

        first = tokenizer.encode(text)
        second = tokenizer.encode(text)
        self.assertEqual(first, second)
        self.assertEqual(tokenizer.decode(first), text)
        self.assertEqual(first[0], BOS_ID)
        self.assertEqual(first[-1], EOS_ID)
        self.assertLess(len(first[1:-1]), len(text.encode("utf-8")))

    def test_reserved_special_ids_are_not_byte_content(self) -> None:
        tokenizer = byte_only_tokenizer()

        self.assertEqual(tokenizer.token_bytes[BOS_ID], b"")
        self.assertEqual(tokenizer.token_bytes[EOS_ID], b"")

        encoded = tokenizer.encode("A")
        self.assertEqual(encoded[0], BOS_ID)
        self.assertEqual(encoded[-1], EOS_ID)
        self.assertNotIn(BOS_ID, encoded[1:-1])
        self.assertNotIn(EOS_ID, encoded[1:-1])
        self.assertEqual(tokenizer.decode(encoded), "A")

    def test_out_of_range_token_ids_are_rejected(self) -> None:
        tokenizer = byte_only_tokenizer()

        for token_id in (-1, tokenizer.vocab_size):
            with self.subTest(token_id=token_id):
                with self.assertRaisesRegex(ValueError, "outside this tokenizer"):
                    tokenizer.decode([token_id])

    def test_load_rejects_invalid_merge_references(self) -> None:
        tokenizer = ByteBPE.train(["abab", "abab"], vocab_size=259)
        valid_merge = tokenizer.to_dict()["merges"][0]
        invalid_references = (
            [-1, valid_merge[1], valid_merge[2]],
            [tokenizer.vocab_size, valid_merge[1], valid_merge[2]],
            [BOS_ID, valid_merge[1], valid_merge[2]],
            [valid_merge[2], valid_merge[1], valid_merge[2]],
        )

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tokenizer.json"
            for merge in invalid_references:
                with self.subTest(merge=merge):
                    payload = tokenizer.to_dict()
                    payload["merges"] = [merge]
                    path.write_text(json.dumps(payload), encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, "Invalid merge reference"):
                        ByteBPE.load(path)

    def test_load_rejects_malformed_merge_entries_and_payload_shapes(self) -> None:
        tokenizer = ByteBPE.train(["abab", "abab"], vocab_size=259)
        malformed_payloads = (
            {
                **tokenizer.to_dict(),
                "merges": "not a list",
            },
            {
                **tokenizer.to_dict(),
                "merges": ["not a merge"],
            },
            {
                **tokenizer.to_dict(),
                "merges": [[97, 98]],
            },
            {
                **tokenizer.to_dict(),
                "merges": [["97", 98, 258]],
            },
            {
                **tokenizer.to_dict(),
                "merges": [[97, 98, 258.0]],
            },
            {
                **tokenizer.to_dict(),
                "vocab_size": True,
            },
            [tokenizer.to_dict()],
        )

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tokenizer.json"
            for payload in malformed_payloads:
                with self.subTest(payload=payload):
                    path.write_text(json.dumps(payload), encoding="utf-8")
                    with self.assertRaisesRegex(
                        ValueError,
                        "Invalid tokenizer|Invalid merge|Tokenizer vocabulary",
                    ):
                        ByteBPE.load(path)


if __name__ == "__main__":
    unittest.main()
