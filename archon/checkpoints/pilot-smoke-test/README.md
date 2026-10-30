# Archon pilot smoke-test checkpoint

This folder preserves the 80-step CPU training run for reproducibility. It is
not the proposed 2B model, a general-purpose language model, or a production
release.

## Run summary

- **Model:** independently initialized, 2-layer causal Transformer
- **Parameters:** 94,528
- **Training:** 80 AdamW steps, CPU, seed 7331
- **Tokenizer:** project byte-level BPE, vocabulary size 320
- **Data:** 50 train, 6 validation, and 7 test passages; 2,896 train tokens
- **Held-out test:** cross entropy 4.9526 nats/token; perplexity 141.55 on 405
  target tokens
- **Limitations:** tiny synthetic corpus; these metrics do not demonstrate
  language capability or generalization

## Files

- `inference.pt` — inference model state
- `last.pt` — final training checkpoint
- `tokenizer.json` — tokenizer vocabulary and merges
- `manifest.json` — run configuration, corpus/split hashes, and environment
- `evaluation.json` — held-out results and limitations

## Licensing

The project owner confirmed public release of the pilot corpus and these
derived pilot artifacts under **CC0 1.0** on 30 Oct. 2026. The source code
remains under the repository's MIT license. The official CC0 1.0 legal code is
available at <https://creativecommons.org/publicdomain/zero/1.0/legalcode>.

The run manifest and evaluation record were created while owner review was
pending. Their release note is updated in this public snapshot; training
configuration, corpus hashes, and measured results are otherwise preserved.
