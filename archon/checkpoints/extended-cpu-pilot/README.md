# Archon extended CPU pilot

This is a reproducibility artifact from a 2,000-step CPU training-pipeline
experiment. It is not an approved base model, a general-purpose language
model, or a production release.

## Run summary

- **Model:** random-initialized, 2-layer causal Transformer
- **Parameters:** 94,528
- **Training:** 2,000 AdamW steps, CPU, seed 7331
- **Tokenizer:** project byte-level BPE, vocabulary size 320, fit on training
  text only
- **Data:** 50 train, 6 validation, and 7 test passages; 2,896 train tokens
- **Validation:** cross entropy 9.7899 nats/token; perplexity 17,852.99 on 329
  target tokens
- **Held-out test:** cross entropy 9.1720 nats/token; perplexity 9,624.11 on
  405 target tokens
- **Comparison:** the earlier 80-step smoke test measured test cross entropy
  4.9526 and perplexity 141.55. The extended run's test score was worse.
- **Limitations:** tiny synthetic fixture; no general language capability or
  generalization is demonstrated

## Files

- `last.pt` — resumable training checkpoint and optimizer state
- `inference.pt` — model state for local inference experiments only
- `tokenizer.json` — tokenizer vocabulary and merges
- `manifest.json` — run configuration, corpus/split hashes, and environment
- `evaluation.json` — held-out measurements and limitations

## Licensing

The project owner confirmed public release of the pilot corpus and derived
pilot artifacts under **CC0 1.0** on 2026-10-30. The source code remains under
the repository's MIT license. The official CC0 1.0 legal code is available at
<https://creativecommons.org/publicdomain/zero/1.0/legalcode>.
