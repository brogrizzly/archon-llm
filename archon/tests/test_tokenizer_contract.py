from __future__ import annotations

import unittest

from archon.tokenizer import ByteBPE


class ByteBPETrainingContractTests(unittest.TestCase):
    def test_training_rejects_vocabulary_smaller_than_base_alphabet(self) -> None:
        with self.assertRaisesRegex(ValueError, "vocab_size must include"):
            ByteBPE.train(["aa", "aa"], vocab_size=257)

    def test_training_rejects_corpus_without_non_empty_text(self) -> None:
        for texts in ([], ["", ""]):
            with self.subTest(texts=texts):
                with self.assertRaisesRegex(ValueError, "non-empty training text"):
                    ByteBPE.train(texts, vocab_size=258)

    def test_training_breaks_equal_frequency_ties_lexicographically(self) -> None:
        tokenizer = ByteBPE.train(["abc", "abc"], vocab_size=259)

        self.assertEqual(tokenizer.merges, [(ord("a"), ord("b"), 258)])

    def test_training_stops_when_no_pair_occurs_twice(self) -> None:
        tokenizer = ByteBPE.train(["abc"], vocab_size=300)

        self.assertEqual(tokenizer.vocab_size, 258)
        self.assertEqual(tokenizer.merges, [])

    def test_training_never_exceeds_requested_vocabulary(self) -> None:
        tokenizer = ByteBPE.train(["aaaa", "aaaa"], vocab_size=259)

        self.assertEqual(tokenizer.vocab_size, 259)
        self.assertEqual(len(tokenizer.token_bytes), tokenizer.vocab_size)

    def test_unicode_round_trip_preserves_exact_text(self) -> None:
        text = "\x00\r\nCafe\u0301 | Café | 中文 | 👩\u200d🚀 | \ufeff"
        tokenizer = ByteBPE.train([text, text], vocab_size=300)

        self.assertEqual(tokenizer.decode(tokenizer.encode(text)), text)


if __name__ == "__main__":
    unittest.main()
