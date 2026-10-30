# Roadmap

This roadmap separates definition work from implementation so the code does
not silently decide the math.

## Foundation

- [x] Establish the Archon and Anchor names and their relationship.
- [x] Create a public project overview and transparent initial model card.
- [x] Record the supplied G4LO formula and separate it from proposed runtime rules.
- [ ] Define the problem Archon is intended to solve.
- [ ] Resolve Anchor's `Pi`, numerator interpretation, coordinate encodings,
  scales, and threshold policy; review the executable specification.
- [ ] Select an initial architecture and explain how it uses Anchor.

## First reproducible prototype

- [x] Use PyTorch for a reproducible CPU pilot; full-scale GPU hardware remains
  unselected and must be benchmarked separately.
- [x] Implement Anchor with reference tests.
- [x] Implement a small, reproducible Archon prototype with an independent
  tokenizer and random initialization.
- [x] Document tokenizer, pilot data declaration, training recipe, and
  full-scale compute limits.
- [x] Evaluate the pilot on held-out data and publish measured limitations.

## Open release

- [ ] Review dataset, dependency, and model-weight licenses.
- [ ] Select or reject the candidate architecture after design review.
- [ ] Acquire and review a broad rights-cleared corpus and provisioned,
  benchmarked GPU resources for any full-scale pretraining.
- [ ] Add reproducible training and inference instructions.
- [ ] Publish versioned specifications, code, and any releasable artifacts.
