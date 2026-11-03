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
from archon.tokenizer import ByteBPE, Utf8ByteCodec, codec_metadata
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
        self.assertEqual(document["architecture"]["attention_heads"], 16)
        self.assertEqual(document["architecture"]["key_value_heads"], 4)
        self.assertEqual(document["architecture"]["head_dimension"], 128)
        self.assertEqual(document["architecture"]["intermediate_size"], 8192)
        self.assertFalse(document["architecture"]["linear_biases"])
        self.assertTrue(document["architecture"]["tied_input_output_embeddings"])
        self.assertEqual(config.parameter_count(), 2_013_399_040)
        self.assertEqual(config.parameter_count(), claimed)
        with torch.device("meta"):
            model = ArchonDecoder(config)
            implementation_count = model.parameter_count()
        self.assertIs(model.output_projection.weight, model.token_embedding.weight)
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
            self.assertEqual(
                first_checkpoint["text_codec"],
                {
                    "format": "archon-byte-bpe-v1",
                    "bos_id": 256,
                    "eos_id": 257,
                    "vocab_size": first_checkpoint["model_config"]["vocabulary_size"],
                },
            )
            for name, first_tensor in first_checkpoint["model_state"].items():
                torch.testing.assert_close(
                    first_tensor,
                    second_checkpoint["model_state"][name],
                    rtol=0,
                    atol=0,
                )

    def test_byte_model_metadata_binds_resume_and_inference_to_codec(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run_directory = Path(directory) / "byte-run"
            config_path = Path(directory) / "byte-config.json"
            config = json.loads((ROOT / "configs/pilot.json").read_text(encoding="utf-8"))
            config["tokenizer_format"] = "utf8-bytes"
            config_path.write_text(json.dumps(config), encoding="utf-8")
            options = {
                "config": str(config_path),
                "steps": 2,
                "device": "cpu",
                "threads": 1,
            }

            report = train(
                Namespace(**options, run_dir=str(run_directory), resume=False)
            )

            expected_codec = codec_metadata(Utf8ByteCodec())
            self.assertEqual(report["text_codec"], expected_codec)
            manifest_path = run_directory / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["text_codec"], expected_codec)
            model, tokenizer, _ = load_inference_model(run_directory)
            self.assertIsInstance(tokenizer, Utf8ByteCodec)
            self.assertEqual(model.config.vocabulary_size, tokenizer.vocab_size)

            checkpoint_path = run_directory / "inference.pt"
            checkpoint = torch.load(
                checkpoint_path,
                map_location="cpu",
                weights_only=True,
            )
            self.assertEqual(checkpoint["text_codec"], expected_codec)
            resumed_report = train(
                Namespace(
                    **options,
                    run_dir=str(run_directory),
                    resume=True,
                    tokenizer_format="utf8-bytes",
                )
            )
            self.assertEqual(resumed_report["completed_steps"], 2)
            self.assertEqual(resumed_report["text_codec"], expected_codec)

            with self.assertRaisesRegex(ValueError, "requested format"):
                train(
                    Namespace(
                        **options,
                        run_dir=str(run_directory),
                        resume=True,
                        tokenizer_format="byte-bpe",
                    )
                )

            last_checkpoint_path = run_directory / "last.pt"
            last_checkpoint = torch.load(
                last_checkpoint_path,
                map_location="cpu",
                weights_only=False,
            )
            last_checkpoint["text_codec"]["format"] = "archon-byte-bpe-v1"
            torch.save(last_checkpoint, last_checkpoint_path)
            with self.assertRaisesRegex(ValueError, "checkpoint text codec metadata"):
                train(
                    Namespace(
                        **options,
                        run_dir=str(run_directory),
                        resume=True,
                        tokenizer_format="utf8-bytes",
                    )
                )

            checkpoint.pop("text_codec")
            torch.save(checkpoint, checkpoint_path)
            with self.assertRaises(InferenceFailure) as context:
                load_inference_model(run_directory)
            self.assertEqual(context.exception.code, "CHECKPOINT_MISMATCH")

            manifest.pop("text_codec")
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaises(InferenceFailure) as context:
                load_inference_model(run_directory)
            self.assertEqual(context.exception.code, "CHECKPOINT_MISMATCH")
            with self.assertRaisesRegex(ValueError, "without text codec metadata"):
                train(
                    Namespace(
                        **options,
                        run_dir=str(run_directory),
                        resume=True,
                        tokenizer_format="utf8-bytes",
                    )
                )

    def test_legacy_byte_bpe_inference_without_codec_metadata_still_loads(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            run_directory = Path(directory) / "legacy-bpe"
            train(
                Namespace(
                    config="archon/configs/pilot.json",
                    run_dir=str(run_directory),
                    steps=1,
                    device="cpu",
                    threads=1,
                    resume=False,
                )
            )
            manifest_path = run_directory / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest.pop("text_codec")
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            checkpoint_path = run_directory / "inference.pt"
            checkpoint = torch.load(
                checkpoint_path,
                map_location="cpu",
                weights_only=True,
            )
            checkpoint.pop("text_codec")
            torch.save(checkpoint, checkpoint_path)

            _, tokenizer, _ = load_inference_model(run_directory)

            self.assertIsInstance(tokenizer, ByteBPE)

    def test_missing_checkpoint_fails_explicitly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(InferenceFailure) as context:
                load_inference_model(Path(directory))
        self.assertEqual(context.exception.code, "CHECKPOINT_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
