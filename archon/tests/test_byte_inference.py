from __future__ import annotations

from types import SimpleNamespace
import unittest

import torch

from archon.inference import InferenceFailure, generate_text
from archon.tokenizer import ByteBPE, Utf8ByteCodec


class ScriptedModel:
    def __init__(
        self,
        generated_ids: list[int],
        *,
        context_length: int = 128,
        vocabulary_size: int = 258,
    ) -> None:
        self.config = SimpleNamespace(context_length=context_length)
        self._generated_ids = iter(generated_ids)
        self._vocabulary_size = vocabulary_size

    def __call__(self, token_ids: torch.Tensor) -> torch.Tensor:
        next_id = next(self._generated_ids)
        logits = torch.full(
            (1, token_ids.shape[1], self._vocabulary_size), float("-inf")
        )
        logits[0, -1, next_id] = 0
        return logits


class ByteInferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.codec = Utf8ByteCodec()

    def test_valid_multibyte_character_can_span_generated_ids(self) -> None:
        model = ScriptedModel([0xE2, 0x82, 0xAC, self.codec.eos_id])

        text, finish_reason = generate_text(model, self.codec, "prompt", 4)

        self.assertEqual(text, "€")
        self.assertEqual(finish_reason, "eos")

    def test_malformed_generated_bytes_are_rejected(self) -> None:
        model = ScriptedModel([0xE2, ord("("), 0xA1, self.codec.eos_id])

        with self.assertRaisesRegex(InferenceFailure, "valid complete UTF-8"):
            generate_text(model, self.codec, "prompt", 4)

    def test_eos_rejects_an_unfinished_character(self) -> None:
        model = ScriptedModel([0xE2, 0x82, self.codec.eos_id])

        with self.assertRaisesRegex(InferenceFailure, "valid complete UTF-8"):
            generate_text(model, self.codec, "prompt", 3)

    def test_output_limit_rejects_an_unfinished_character(self) -> None:
        model = ScriptedModel([0xE2, 0x82])

        with self.assertRaisesRegex(InferenceFailure, "valid complete UTF-8"):
            generate_text(model, self.codec, "prompt", 2)

    def test_output_limit_returns_valid_complete_text_without_eos(self) -> None:
        model = ScriptedModel([ord("A")])

        text, finish_reason = generate_text(model, self.codec, "prompt", 1)

        self.assertEqual(text, "A")
        self.assertEqual(finish_reason, "max_new_tokens")

    def test_bpe_valid_multibyte_character_can_span_generated_ids(self) -> None:
        tokenizer = ByteBPE.train(["seed", "seed"], vocab_size=258)
        model = ScriptedModel([0xE2, 0x82, 0xAC, tokenizer.eos_id])

        text, finish_reason = generate_text(model, tokenizer, "prompt", 4)

        self.assertEqual(text, "€")
        self.assertEqual(finish_reason, "eos")

    def test_bpe_merged_piece_can_end_mid_character(self) -> None:
        tokenizer = ByteBPE.train(["€€", "€€"], vocab_size=259)
        merged_id = tokenizer.merges[0][2]
        self.assertEqual(tokenizer.token_bytes[merged_id], b"\x82\xAC")
        model = ScriptedModel(
            [0xE2, merged_id, tokenizer.eos_id],
            vocabulary_size=tokenizer.vocab_size,
        )

        text, finish_reason = generate_text(model, tokenizer, "prompt", 3)

        self.assertEqual(text, "€")
        self.assertEqual(finish_reason, "eos")

    def test_bpe_malformed_generated_bytes_are_rejected(self) -> None:
        tokenizer = ByteBPE.train(["seed", "seed"], vocab_size=258)
        model = ScriptedModel([0x80, tokenizer.eos_id])

        with self.assertRaisesRegex(InferenceFailure, "valid complete UTF-8"):
            generate_text(model, tokenizer, "prompt", 2)

    def test_bpe_eos_and_cutoff_reject_unfinished_characters(self) -> None:
        tokenizer = ByteBPE.train(["seed", "seed"], vocab_size=258)
        for generated_ids, limit in (
            ([0xE2, 0x82, tokenizer.eos_id], 3),
            ([0xE2, 0x82], 2),
        ):
            with self.subTest(generated_ids=generated_ids):
                model = ScriptedModel(generated_ids)
                with self.assertRaisesRegex(
                    InferenceFailure, "valid complete UTF-8"
                ):
                    generate_text(model, tokenizer, "prompt", limit)


if __name__ == "__main__":
    unittest.main()
