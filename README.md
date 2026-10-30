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

## Current status

| Area | Status |
| --- | --- |
| Project name and relationship | Archon is the model project; Anchor is its math |
| Anchor formula | G4LO formula supplied; `Pi`, numerator semantics, and numeric policy unresolved |
| Large architecture | Candidate count 2,013,399,040 matches the config and implementation; not approved or trained |
| Small training pipeline | Reproducible two-layer CPU pilot, independent byte-BPE tokenizer, random initialization |
| Pilot data | Tiny project-authored fixture with documented CC0 1.0 declaration |
| Evaluation | Held-out token loss/perplexity measured; not a language-capability benchmark |
| Released weights | None |

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

## License

The project code is licensed under the MIT License; see [`LICENSE`](LICENSE).
The pilot corpus has a separate declaration in
[`archon/data/README.md`](archon/data/README.md).
