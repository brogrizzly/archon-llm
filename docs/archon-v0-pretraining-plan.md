# Archon v0.0 pretraining readiness

**Status: blocked; no base-model architecture or full-scale run is approved.**

The repository now contains an extended, reproducible CPU pilot, but its
measured held-out result regressed relative to the earlier 80-step smoke test.
It does not meet the definition of an Archon v0.0 base model. Do not describe
either pilot checkpoint as a general-purpose model or release it for user
inference.

## Current pilot choices

These settings apply only to the pipeline experiment:

- **Architecture:** 2-layer dense causal decoder, hidden size 64, intermediate
  size 128, 4 query heads, 2 key/value heads, head dimension 16, RoPE,
  pre-RMSNorm, SwiGLU, tied embeddings, context length 64; 94,528 parameters.
- **Tokenizer:** project byte-level BPE, target vocabulary 320, trained only on
  the training partition. This tokenizer has not been evaluated for a broad
  corpus or selected for a base model.
- **Corpus:** 63 original short passages authored for this project, released
  under owner-confirmed CC0 1.0. It has 2,896 training tokens after the
  deterministic split and is only a pipeline fixture.
- **Training hardware:** x86_64 CPU, 4 logical CPUs, about 8.2 GB total system
  RAM, CUDA unavailable; the run used one CPU thread.
- **Reproduction:** Python 3.13.11, PyTorch 2.15.0+cpu, seed 7331, AdamW,
  batch size 8, learning rate 0.001, weight decay 0.01, gradient clipping 1.0,
  2,000 steps. See `../archon/configs/extended-cpu-pilot.json`.

## Full-scale architecture and hardware decision

No target architecture has been selected. The existing
`../archon/configs/candidate-2b.json` describes a 2,013,399,040-parameter
candidate, but it remains unapproved. Selecting it as the base-model target
without an adequate corpus and benchmarked compute plan would be premature.

The separate direct-UTF-8-byte pilot direction and first-device priorities
(iPhone 14 Plus first, older iPads after its demonstration) are recorded in
[`utf8-byte-direction.md`](utf8-byte-direction.md), with the staged device
acceptance plan in
[`archon-first-device-validation.md`](archon-first-device-validation.md).
These are planning documents; byte BPE remains the implemented training
tokenizer until a separate byte model is trained and validated.

The current machine is inadequate for that candidate. BF16 weights alone
would occupy about 4.03 GB; a common mixed-precision AdamW setup is estimated
at about 32.2 GB for parameters, gradients, master weights, and optimizer
moments before activations and runtime overhead. No GPU is available here.

An initial, unapproved planning note suggests an 80 GB A100/H100-class
accelerator for pretraining, with L4/A10G-class hardware limited to small
architecture sweeps; at least 500 GB of fast local NVMe scratch; and a
CUDA-enabled PyTorch environment with distributed-training and profiling
tools. It also suggests 1B–10B tokens as a proof-of-concept range. These are
starting targets, not a benchmarked or costed plan. Before architecture
approval, confirm the target parameter scale and cloud budget, then benchmark
the intended sequence length and microbatch size. Use measured throughput and
memory headroom to set training duration, parallelism, checkpoint cadence,
and total compute.

## Corpus decision

The only currently confirmed rights-cleared source is the project-authored
CC0 fixture described in `../archon/data/README.md`. Its size and content are
not sufficient for useful language-model pretraining. No broad corpus has
been selected or cleared for the intended training use. Do not substitute a
web scrape, third-party model output, or a dataset with ambiguous source-text
rights. FineWeb, Dolma, RedPajama, Wikimedia, and public-domain book archives
are discovery leads only; a dataset's collection license does not by itself
clear its individual source texts. Full pretraining remains blocked until a
sufficiently large corpus has recorded source provenance, applicable
licenses, permitted use, filtering rules, token count, and a reproducible
manifest.

## Gate to resume full training work

1. Select an architecture and tokenizer against the intended language,
   context length, and deployment constraints.
2. Review and document a broad corpus's source-level rights and license, not
   only the license of a dataset wrapper or collection.
3. Provision and benchmark adequate accelerator compute and storage.
4. Define held-out evaluation data and capability/safety evaluations before
   training; report measured results and limitations in `model-card.md`.

Until these gates are met, the extended CPU run is the project's latest
reproducibility artifact, not an Archon v0.0 release.
