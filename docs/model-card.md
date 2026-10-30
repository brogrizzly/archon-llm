# Archon model card

**Status:** small independent training-pipeline pilot completed; no
production or general-purpose model exists.

## Overview

- **Name:** Archon
- **Model type:** independently trained language-model project
- **Mathematical foundation:** Anchor; no Anchor operator is inferred or used
  by the pilot's language-model loss. The historical Euclid reference and
  project-source credit are scoped in [`works-cited.md`](works-cited.md).
- **Pilot:** 2-layer causal Transformer, 94,528 trainable parameters
- **Large architecture:** proposed candidate only; 2,013,399,040 parameters
  verified by formula and implementation-graph accounting, not trained
- **Pilot artifact:** published at
  [`../archon/checkpoints/pilot-smoke-test/`](../archon/checkpoints/pilot-smoke-test/)
  under CC0 1.0; this is not a production or general-purpose model release

## Intended use

The pilot is for validating tokenizer training, random initialization,
next-token training, checkpoint recovery, deterministic splits, and held-out
measurement. It is not suitable for general-purpose chat, decision-making, or
state-changing workflows.

## Training data and process

The pilot uses 63 original short passages written for this repository. The
project owner confirmed public release of the corpus and derived pilot
artifacts under CC0 1.0; see
[`../archon/data/README.md`](../archon/data/README.md). It uses no external
pretraining data and no other model's weights, tokenizer, configuration, or
distillation outputs.

The deterministic split used by the reported run contains 50 training, 6
validation, and 7 test passages. The byte-level BPE tokenizer was trained only
on the training partition (target and achieved vocabulary: 320). Model weights
were initialized from a fixed random seed. The objective is mean next-token
cross entropy. The report records the corpus digest and split digests,
configuration, seed, software versions, optimizer, steps, and hardware.

## Evaluation

The held-out result is a pilot measurement on 405 test target tokens:

- Cross entropy: **4.9526 nats/token**
- Perplexity: **141.55**

Validation cross entropy at the start of the run was 61.5292 nats/token and
after 80 optimizer steps was 4.9924 nats/token. These measurements only show
that the small pipeline executed on its synthetic fixture. They are not
benchmarks of language ability and must not be used to claim generalization.

Full settings and limitations are in
[`pilot-evaluation.md`](pilot-evaluation.md).

## Limitations and risks

- The tiny authored corpus does not represent a broad language distribution.
- A tiny pilot inference checkpoint is included only to reproduce the pipeline
  run. There is no production or quantized checkpoint, and no public inference
  service.
- No safety, truthfulness, instruction-following, or domain-quality evaluation
  has been conducted.
- Anchor's `Pi` operator, numerator semantics, and any role in a model objective
  remain unspecified.
- Full 2B pretraining requires a broad rights-cleared corpus and separately
  provisioned and benchmarked GPU resources. No such run occurred here.
- Do not use pilot outputs to make decisions or modify persistent state.
