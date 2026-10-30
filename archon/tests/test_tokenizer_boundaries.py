from __future__ import annotations

import unittest

from archon.tokenizer import BOS_ID, EOS_ID, ByteBPE


def byte_only_tokenizer() -> ByteBPE:
    """Create a tokenizer with only the base byte vocabulary."""
    return ByteBPE.train(["seed", "seed"], vocab_size=258)


class ByteBPEBoundaryTests(unittest.TestCase):
    def test_invalid_utf8_byte_sequences_decode_with_replacement(self) -> None:
        tokenizer = byte_only_tokenizer()
        malformed_sequences = (
            b"\x80",       # lone continuation byte
            b"\xc0\xaf",   # overlong encoding
            b"\xe2\x82",   # truncated three-byte sequence
            b"\xe2(\xa1",  # invalid continuation in a three-byte sequence
        )

        for malformed in malformed_sequences:
            with self.subTest(malformed=malformed):
                decoded = tokenizer.decode(malformed)
                self.assertEqual(
                    decoded,
                    malformed.decode("utf-8", errors="replace"),
                )
                self.assertIn("\ufffd", decoded)

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


if __name__ == "__main__":
    unittest.main()
