# Archon pilot evaluation

**Run status:** extended CPU pipeline pilot completed; not a model release
**Date:** 2026-10-30  
**Purpose:** exercise independent tokenizer training, random model
initialization, next-token optimization, checkpoints, split isolation, and
held-out measurement. It does not satisfy the compute, corpus, or capability
requirements for Archon v0.0.

## Model and training setup

| Setting | Measured run |
| --- | --- |
| Architecture | Decoder-only causal Transformer; GQA, RoPE, pre-RMSNorm, SwiGLU |
| Layers / hidden / intermediate | 2 / 64 / 128 |
| Query heads / key-value heads / head dimension | 4 / 2 / 16 |
| Context / vocabulary | 64 / 320 |
| Trainable parameters | 94,528 |
| Initialization | Random; no pretrained tensors loaded |
| Tokenizer | Project implementation of byte-level BPE; fitted on training text only |
| Objective | Mean next-token cross entropy |
| Optimizer | AdamW, learning rate 0.001, weight decay 0.01 |
| Batch / steps / gradient clipping | 8 / 2,000 / 1.0 |
| Seed / threads | 7331 / 1 |
| Software | Python 3.13.11, PyTorch 2.15.0+cpu |
| Hardware | CPU only; x86_64; CUDA unavailable |
| Elapsed training time | 19.49 seconds; not a throughput benchmark |

The input is 63 unique short passages written for this repository and released
under CC0 1.0 as confirmed by the project owner on 2026-10-30 in
[`../archon/data/README.md`](../archon/data/README.md). The raw
corpus SHA-256 is
`843dec3e3e1b2dbb2a80437c34e4c19afa4ef1f73e5868eb8ec02e70a25632d8`.
The deterministic split produced 50 train, 6 validation, and 7 test passages.
It contains 2,896 train tokens, 330 validation tokens, and 406 test tokens
including boundary tokens. Each held-out partition is disjoint from the
training partition; the tokenizer was fitted only on training passages.

## Measured results

| Evaluation | Target tokens | Cross entropy (nats/token) | Perplexity |
| --- | ---: | ---: | ---: |
| Validation at run start | 329 | 61.5292 | 5.27 × 10²⁶ |
| Validation after 2,000 steps | 329 | 9.7899 | 17,852.99 |
| Held-out test after 2,000 steps | 405 | 9.1720 | 9,624.11 |

For comparison, the preserved 80-step smoke test had validation cross entropy
4.9924 (perplexity 147.28) and held-out test cross entropy 4.9526 (perplexity
141.55). The 2,000-step run did not improve these held-out measurements. The
test partition was not used for gradient updates or parameter selection in
either run. The tiny sample sizes make the scores unstable diagnostics, not
language benchmarks or evidence of generalization.

Reproduce the extended run with:

```sh
python -m archon.train \
  --config archon/configs/extended-cpu-pilot.json \
  --run-dir archon/checkpoints/extended-cpu-pilot
```

The configuration, manifest, resumable checkpoint, inference checkpoint,
tokenizer, and `evaluation.json` are preserved in
[`../archon/checkpoints/extended-cpu-pilot/`](../archon/checkpoints/extended-cpu-pilot/).
The manifest includes corpus and partition hashes, configuration, seed, and
runtime versions. The original smoke-test artifacts remain in
[`../archon/checkpoints/pilot-smoke-test/`](../archon/checkpoints/pilot-smoke-test/).

## Candidate full-scale model validation

The proposed configuration in
[`../archon/configs/candidate-2b.json`](../archon/configs/candidate-2b.json)
specifies 32 layers, hidden size 2048, intermediate size 8192, 16 query heads,
4 key/value heads, 128 dimensions per head, vocabulary 32768, tied embeddings,
and context length 4096. The parameter formula and PyTorch module graph on the
meta device both count **2,013,399,040** parameters, matching the supplied
claim. Meta-device checking allocates no full-sized weights. The config remains
`candidate-not-approved`; it has not been trained or selected.

## Blockers to Archon v0.0

- The corpus is tiny, synthetic, and project-authored; it does not support a
  language-quality claim or replace broad pretraining data. It is CC0-cleared,
  but no broad, rights-cleared training corpus has been selected.
- No external benchmark, generated-text review, safety evaluation, or
  instruction-following evaluation was run.
- The available machine is x86_64 with 4 logical CPUs, about 8.2 GB total RAM,
  and no CUDA GPU. The pilot's CPU runtime cannot estimate full-scale GPU
  throughput.
- At the candidate size, BF16 weights alone are about 4.03 GB (decimal).
  Under a common mixed-precision AdamW arrangement of BF16 parameters and
  gradients, FP32 master parameters, and two FP32 optimizer moments, those
  tensors alone use roughly 32.2 GB (decimal), before activations, workspaces,
  communication buffers, fragmentation, and checkpoint storage. This exceeds
  the available system memory and the candidate was not allocated.
- Full pretraining requires a selected architecture, a broad corpus whose
  provenance, license, filtering, and permitted use are documented, plus
  separately provisioned accelerator hardware benchmarked at the intended
  4096-token context. Current readiness and decisions are recorded in
  [`archon-v0-pretraining-plan.md`](archon-v0-pretraining-plan.md).
- No quantization, full-scale release checkpoint, or Anchor-integrated loss is
  included. The included checkpoints are reproducibility artifacts only.
