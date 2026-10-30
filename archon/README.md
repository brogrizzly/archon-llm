# Archon training prototype

Archon is an independent open-source language-model project. **Anchor** is its
mathematical foundation, but Anchor's unresolved `Pi` operator and numerator
semantics are not assumed by this training objective.

## Status

The repository contains a small, random-initialization CPU pilot and an
independently trained byte-BPE tokenizer. This is a pipeline validation, not a
useful or released language model. It uses only the original project-authored
fixture at [`data/pilot_corpus.txt`](data/pilot_corpus.txt).

An opt-in local inference prototype now exists for testing the guarded
Archon-to-Anchor proposal boundary. It requires a locally trained
`inference.pt` checkpoint; no inference-ready checkpoint is currently included
or released. The pilot remains unsuitable for general-purpose use.

The proposed 32-layer, 2,013,399,040-parameter model is recorded in
[`configs/candidate-2b.json`](configs/candidate-2b.json) as
`candidate-not-approved`. Its parameter count matches both the analytical
accounting and the implemented module graph on PyTorch's meta device. The model
has not been allocated or trained at full size.

## Reproduce the pilot

Use Python 3.13 and install the pinned dependency into the same interpreter you
use to run the commands:

```sh
python -m pip install -r archon/requirements.txt
python -m archon.validate_candidate
python -m unittest discover -s archon/tests -v
python -m archon.train --run-dir archon/runs/pilot
```

In this Replit workspace, where PyTorch is installed in `.pythonlibs`, use
`./.pythonlibs/bin/python` in place of `python`.

The default run uses seed `7331`, one CPU thread, 80 AdamW steps, batch size 8,
context length 64, learning rate `0.001`, weight decay `0.01`, and gradient
clipping at `1.0`. It starts with newly initialized weights, trains the BPE
tokenizer only on the training partition, and saves checkpoints and a
machine-readable evaluation report under `archon/runs/` (ignored by Git).
The corpus is split deterministically by record and seed into training,
validation, and test partitions. A checkpoint can be resumed with
`--resume`; the corpus, tokenizer, seed, model, and training settings must
match.

To run fewer steps while checking the pipeline:

```sh
python -m archon.train --steps 2 --run-dir /tmp/archon-smoke
```

See [`../docs/pilot-evaluation.md`](../docs/pilot-evaluation.md) for the
measured run and its limitations. Dataset provenance and the declared license
are in [`data/README.md`](data/README.md).

## Candidate architecture and scale boundary

The candidate specifies a dense causal Transformer with 32 layers, hidden size
2048, intermediate size 8192, 16 query heads, 4 key/value heads, 128 dimensions
per head, RoPE, SwiGLU, bias-free linear layers, tied embeddings, vocabulary
32768, and context length 4096. The proposed count is 2,013,399,040 trainable
parameters. The executable validator checks both the formula and the model
implementation without allocating full-size tensors.

Passing parameter accounting does not select or approve the candidate. The
pilot configuration is separately defined in
[`configs/pilot.json`](configs/pilot.json); it has 94,528 parameters.

Full pretraining needs a broad, rights-cleared corpus with recorded provenance,
licenses, filtering, and an approved use basis. This workspace has no CUDA GPU.
The candidate's BF16 weights alone would be about 4.03 GB; a common
mixed-precision AdamW setup can require roughly 32.2 GB for parameters,
gradients, master weights, and optimizer moments before activations, buffers,
and runtime overhead. Full-scale GPU hardware and throughput must be separately
provisioned and benchmarked. The pilot does not attempt full-scale training,
quantization, or a user-facing inference service. The local proposal adapter and
its resource requirements are documented in
[`../docs/archon-inference.md`](../docs/archon-inference.md).
