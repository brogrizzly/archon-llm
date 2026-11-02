from __future__ import annotations

from types import SimpleNamespace
import unittest

import torch

from archon.inference import InferenceFailure, generate_text
from archon.tokenizer import Utf8ByteCodec


class ScriptedModel:
    def __init__(self, generated_ids: list[int], *, context_length: int = 128) -> None:
        self.config = SimpleNamespace(context_length=context_length)
        self._generated_ids = iter(generated_ids)

    def __call__(self, token_ids: torch.Tensor) -> torch.Tensor:
        next_id = next(self._generated_ids)
        logits = torch.full((1, token_ids.shape[1], 258), float("-inf"))
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


if __name__ == "__main__":
    unittest.main()
