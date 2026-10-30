# Archon project brief

## Purpose

Build and document an open-source language model named **Archon**, with
**Anchor** as the name for its mathematical foundation.

## Confirmed

- The project is an LLM.
- The model project is named Archon.
- Its math is named Anchor.
- The intent is to document and build it as open source.
- A small CPU training pilot uses random initialization and an independently
  trained byte-BPE tokenizer.
- The 32-layer, approximately 2B dense decoder configuration remains a
  candidate; its 2,013,399,040 parameter count has been checked against the
  implementation without allocating full weights.

## Not yet specified

- The problem and intended users.
- Anchor's `Pi` operator, numerator interpretation and normalization,
  coordinate encodings, scale values, and threshold policy.
- Any convergence or other theoretical claim beyond the supplied formula.
- Whether Anchor defines a new architecture, an objective, a training method,
  or another part of the system.
- Whether the large candidate architecture is selected for Archon.
- A broad pretraining corpus, its provenance, licenses, filtering, and permitted
  use.
- Full-scale compute budget and hardware; the current environment has no CUDA
  GPU.
- Evaluation plan for any released or user-facing model.
- The pilot's intended use is limited to testing the training pipeline; it is
  not a general-purpose model.
- Whether “/anchor” is intended as a mathematical name only or also a public
  URL/package path; this repository uses `anchor/` for the math area.

The G4LO formula supplied by the project owner is preserved in
[`anchor-mathematics.md`](anchor-mathematics.md). Its execution contract remains
proposed and incomplete; no missing semantics are inferred. The historical
Euclid reference and source-credit boundary are documented in
[`works-cited.md`](works-cited.md); Euclid is not credited as the source of
G4LO.

These are open questions, not implied decisions. Update this brief when the
project owner makes them.
