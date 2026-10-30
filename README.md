# Archon

Archon is an open-source language-model project. **Anchor** is the name for
its mathematical foundation.

> **Status: prototype.** This repository now contains a small independently
> initialized CPU training pilot, not a general-purpose or released model. The
> proposed 2B configuration is parameter-count checked but remains
> unapproved. Anchor's G4LO formula is recorded, while its execution semantics
> remain incomplete.

## Project areas

- [`anchor/`](anchor/README.md) — the mathematical specification and
  deterministic core for Anchor.
- [`archon/`](archon/README.md) — candidate configuration and independent
  tokenizer/model training code.
- [`docs/`](docs/) — project scope, model card, pilot evaluation, and roadmap.
- [`docs/works-cited.md`](docs/works-cited.md) — MLA 9 reference and source credit.

## Current status

| Area | Status |
| --- | --- |
| Project name and relationship | Archon is the model project; Anchor is its math |
| Anchor formula | G4LO formula supplied; `Pi`, numerator semantics, and numeric policy unresolved |
| Large architecture | Candidate count 2,013,399,040 matches the config and implementation; not approved or trained |
| Small training pipeline | Reproducible two-layer CPU pilot, independent byte-BPE tokenizer, random initialization |
| Pilot data | Tiny project-authored fixture; public CC0 1.0 release confirmed |
| Evaluation | Held-out token loss/perplexity measured; not a language-capability benchmark |
| Pilot artifacts | Tiny 94,528-parameter smoke-test bundle included under CC0 1.0 |
| Full-scale or production weights | None |

## Working principles

1. Keep mathematical definitions precise, versioned, and independently
   reviewable.
2. Distinguish established decisions from proposals and unanswered questions.
3. Record model, data, and evaluation details before making performance claims.
4. Do not describe a pipeline pilot as a trained full-scale or production-ready
   model.

## Run the pilot

With Python 3.13 and the dependency installed:

```sh
python -m pip install -r archon/requirements.txt
python -m archon.validate_candidate
python -m unittest discover -s archon/tests -v
python -m archon.train --run-dir archon/runs/pilot
```

In this Replit workspace, use `./.pythonlibs/bin/python` instead of `python`
when running these commands.

See [`archon/README.md`](archon/README.md) for settings and
[`docs/pilot-evaluation.md`](docs/pilot-evaluation.md) for measured results and
limitations.

## Included pilot checkpoint

For reproducibility, [`archon/checkpoints/pilot-smoke-test/`](archon/checkpoints/pilot-smoke-test/)
contains the 80-step CPU pilot checkpoint, tokenizer, manifest, and evaluation
record. It is a 94,528-parameter pipeline smoke test, not the proposed 2B model
or a general-purpose language model. The corpus and derived pilot artifacts
are released under CC0 1.0; source code remains under MIT.

## License

The project code is licensed under the MIT License; see [`LICENSE`](LICENSE).
The pilot corpus has a separate declaration in
[`archon/data/README.md`](archon/data/README.md).
