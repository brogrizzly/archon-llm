from __future__ import annotations

import unittest

from archon.tokenizer import BOS_ID, EOS_ID, ByteBPE


def byte_only_tokenizer() -> ByteBPE:
    return ByteBPE.train(["seed", "seed"], vocab_size=258)


class ByteBPEStreamProtocolTests(unittest.TestCase):
    def test_decode_rejects_boolean_and_non_integer_ids(self) -> None:
        tokenizer = byte_only_tokenizer()

        for token_id in (True, 97.0, "97"):
            with self.subTest(token_id=token_id):
                with self.assertRaisesRegex(ValueError, "Invalid token ID"):
                    tokenizer.decode([token_id])

    def test_stream_requires_bos_before_byte_content(self) -> None:
        decoder = byte_only_tokenizer().stream_decoder()

        with self.assertRaisesRegex(ValueError, "begin with BOS"):
            decoder.feed([ord("x")])

    def test_stream_rejects_bos_inside_sequence(self) -> None:
        decoder = byte_only_tokenizer().stream_decoder()

        with self.assertRaisesRegex(ValueError, "Unexpected BOS"):
            decoder.feed([BOS_ID, ord("x"), BOS_ID])

    def test_stream_rejects_content_after_eos(self) -> None:
        decoder = byte_only_tokenizer().stream_decoder()

        self.assertEqual(decoder.feed([BOS_ID, EOS_ID]), "")
        with self.assertRaisesRegex(ValueError, "cannot follow EOS"):
            decoder.feed([ord("x")])

    def test_stream_requires_eos_unless_explicitly_disabled(self) -> None:
        decoder = byte_only_tokenizer().stream_decoder()

        self.assertEqual(decoder.feed([BOS_ID, ord("x")]), "x")
        with self.assertRaisesRegex(ValueError, "must end with EOS"):
            decoder.finish()

        permissive = byte_only_tokenizer().stream_decoder()
        self.assertEqual(permissive.feed([BOS_ID, ord("x")]), "x")
        permissive.finish(require_eos=False)
        self.assertEqual(permissive.feed([EOS_ID]), "")

    def test_empty_stream_accepts_a_complete_bos_eos_frame(self) -> None:
        decoder = byte_only_tokenizer().stream_decoder()

        self.assertEqual(decoder.feed([BOS_ID, EOS_ID]), "")
        decoder.finish()


if __name__ == "__main__":
    unittest.main()
