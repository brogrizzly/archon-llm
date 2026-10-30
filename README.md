# Archon

Archon is an open-source language-model project. **Anchor** is the name for
its mathematical foundation.

> **Status: project foundation.** Archon is not yet a trained or runnable
> language model. Anchor's equations and the model architecture have not yet
> been specified. This repository keeps those unknowns explicit rather than
> presenting guesses as design decisions.

## Project areas

- [`anchor/`](anchor/README.md) — the mathematical specification for Anchor.
- [`archon/`](archon/README.md) — the language-model implementation.
- [`docs/`](docs/) — project scope, model card, and development roadmap.

## Current status

| Area | Status |
| --- | --- |
| Project name and relationship | Archon is the model project; Anchor is its math |
| Anchor equations | Not specified |
| Model architecture | Not specified |
| Training and inference code | Not implemented |
| Weights and evaluations | None |

## Working principles

1. Keep mathematical definitions precise, versioned, and independently
   reviewable.
2. Distinguish established decisions from proposals and unanswered questions.
3. Record model, data, and evaluation details before making performance claims.
4. Do not describe a prototype as a trained or production-ready model.

## Getting started

There is no runnable model yet. Begin with the specifications in
[`anchor/README.md`](anchor/README.md) and [`archon/README.md`](archon/README.md).
Implementation should follow once the equations and architecture are agreed.

## License

This project is licensed under the MIT License; see [`LICENSE`](LICENSE).
