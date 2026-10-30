from __future__ import annotations

import json
from pathlib import Path
import unittest

import torch

from archon.inference import generate_text, load_inference_model


ROOT = Path(__file__).resolve().parents[1]
GOLDEN_PATH = Path(__file__).parent / "golden" / "pilot-smoke-inference.json"


class PilotInferenceGoldenTests(unittest.TestCase):
    def test_smoke_checkpoint_matches_versioned_golden(self) -> None:
        golden = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        previous_thread_count = torch.get_num_threads()
        torch.set_num_threads(1)
        try:
            model, tokenizer, model_digest = load_inference_model(
                ROOT / golden["run_directory"]
            )
            text, finish_reason = generate_text(
                model,
                tokenizer,
                golden["prompt"],
                golden["max_new_tokens"],
            )
        finally:
            torch.set_num_threads(previous_thread_count)

        self.assertEqual(
            {
                "text": text,
                "finish_reason": finish_reason,
                "model_digest": model_digest,
            },
            golden["expected"],
        )


if __name__ == "__main__":
    unittest.main()
