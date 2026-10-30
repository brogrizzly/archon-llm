from __future__ import annotations

import json
from argparse import Namespace
from pathlib import Path
import tempfile
import unittest

import torch

from archon.config import ModelConfig, candidate_config
from archon.data_pipeline import load_and_split
from archon.inference import (
    InferenceFailure,
    generate_text,
    load_inference_model,
    run_request,
)
from archon.model import ArchonDecoder
from archon.tokenizer import ByteBPE
from archon.train import train


ROOT = Path(__file__).resolve().parents[1]


class CandidateArchitectureTests(unittest.TestCase):
    def test_candidate_parameter_count_matches_supplied_claim(self) -> None:
        config, claimed, document = candidate_config(
            ROOT / "configs/candidate-2b.json"
        )
        self.assertEqual(config.layers, 32)
        self.assertEqual(config.context_length, 4096)
        self.assertEqual(config.vocabulary_size, 32768)
        self.assertEqual(config.parameter_count(), 2_013_399_040)
        self.assertEqual(config.parameter_count(), claimed)
        with torch.device("meta"):
            implementation_count = ArchonDecoder(config).parameter_count()
        self.assertEqual(implementation_count, claimed)
        self.assertEqual(document["status"], "candidate-not-approved")


class PilotComponentTests(unittest.TestCase):
    def test_splits_are_repeatable_disjoint_and_cover_corpus(self) -> None:
        corpus = ROOT / "data/pilot_corpus.txt"
        first = load_and_split(corpus, 7331, 0.8, 0.1, 0.1)
        second = load_and_split(corpus, 7331, 0.8, 0.1, 0.1)
        self.assertEqual(first, second)
        self.assertFalse(set(first.train) & set(first.validation))
        self.assertFalse(set(first.train) & set(first.test))
        self.assertFalse(set(first.validation) & set(first.test))
        self.assertEqual(
            len(first.train) + len(first.validation) + len(first.test),
            len(corpus.read_text(encoding="utf-8").splitlines()),
        )

    def test_byte_bpe_round_trips_utf8_and_persists_independently(self) -> None:
        training_text = ["Anchor stores a state.", "Archon predicts a token."]
        tokenizer = ByteBPE.train(training_text, vocab_size=300)
        example = "Unseen café 🚀"
        tokens = tokenizer.encode(example)
        self.assertEqual(tokenizer.decode(tokens), example)
        self.assertLessEqual(tokenizer.vocab_size, 300)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tokenizer.json"
            tokenizer.save(path)
            restored = ByteBPE.load(path)
            self.assertEqual(restored.to_dict(), tokenizer.to_dict())
            self.assertEqual(restored.decode(restored.encode(example)), example)

    def test_pilot_model_matches_accounting_and_is_causal(self) -> None:
        torch.manual_seed(4)
        config = ModelConfig(
            layers=2,
            hidden_size=32,
            intermediate_size=64,
            attention_heads=4,
            key_value_heads=2,
            head_dimension=8,
            vocabulary_size=300,
            context_length=16,
        )
        model = ArchonDecoder(config).eval()
        self.assertEqual(model.parameter_count(), config.parameter_count())
        self.assertIs(model.output_projection.weight, model.token_embedding.weight)
        prefix = torch.tensor([[1, 2, 3]])
        extended = torch.tensor([[1, 2, 3, 4, 5]])
        with torch.no_grad():
            prefix_logits = model(prefix)
            extended_logits = model(extended)
        self.assertEqual(tuple(prefix_logits.shape), (1, 3, 300))
        torch.testing.assert_close(prefix_logits, extended_logits[:, :3, :])

    def test_training_checkpoint_resumes_and_repeats_from_seed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first_run = Path(directory) / "first"
            second_run = Path(directory) / "second"
            options = {
                "config": "archon/configs/pilot.json",
                "steps": 2,
                "device": "cpu",
                "threads": 1,
                "resume": False,
            }
            first_report = train(Namespace(**options, run_dir=str(first_run)))
            self.assertTrue((first_run / "last.pt").is_file())
            self.assertTrue((first_run / "inference.pt").is_file())
            self.assertTrue((first_run / "evaluation.json").is_file())
            self.assertEqual(first_report["completed_steps"], 2)
            self.assertEqual(first_report["tokenizer_training_partition"], "train-only")

            inference_model, inference_tokenizer, model_digest = load_inference_model(
                first_run
            )
            generated_text, finish_reason = generate_text(
                inference_model,
                inference_tokenizer,
                "Answer:",
                max_new_tokens=3,
            )
            self.assertIsInstance(generated_text, str)
            self.assertIn(finish_reason, {"eos", "max_new_tokens", "context_limit"})
            self.assertEqual(len(model_digest), 64)
            response = run_request(
                first_run,
                {"prompt": "Answer:", "max_new_tokens": 3},
            )
            self.assertTrue(response["ok"])
            self.assertIn(response["result"]["finish_reason"], {
                "eos",
                "max_new_tokens",
                "context_limit",
            })

            resumed_report = train(
                Namespace(**{**options, "resume": True}, run_dir=str(first_run))
            )
            second_report = train(Namespace(**options, run_dir=str(second_run)))
            self.assertEqual(first_report["test"], resumed_report["test"])
            self.assertEqual(first_report["test"], second_report["test"])

            first_checkpoint = torch.load(
                first_run / "last.pt",
                map_location="cpu",
                weights_only=False,
            )
            second_checkpoint = torch.load(
                second_run / "last.pt",
                map_location="cpu",
                weights_only=False,
            )
            self.assertEqual(first_checkpoint["global_step"], 2)
            for name, first_tensor in first_checkpoint["model_state"].items():
                torch.testing.assert_close(
                    first_tensor,
                    second_checkpoint["model_state"][name],
                    rtol=0,
                    atol=0,
                )

    def test_missing_checkpoint_fails_explicitly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(InferenceFailure) as context:
                load_inference_model(Path(directory))
        self.assertEqual(context.exception.code, "CHECKPOINT_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
