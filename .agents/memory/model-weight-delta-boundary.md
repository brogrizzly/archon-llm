---
name: Model deltas vs. G4LO WeightDelta
description: Distinguishes learned neural-network parameter changes from G4LO's state-change and provenance format.
---

G4LO's `WeightDelta` is a deterministic state-change record with base/result
digests, ordering, provenance, and validation boundaries. The Day 26 prototype
also uses “weight” for instrument-measured mass/force values. This is not a
LoRA adapter or a trainable tensor-delta format.

**Why:** The project owner says they wrote 4LO and explicitly permits reusing
relevant 4LO code for Archon. Conflating its state deltas with model parameters
would still misrepresent Archon's checkpoints or future adapters.

**How to apply:** Reuse relevant 4LO code for Archon with source attribution,
but do not infer rights to third-party contributions or dependencies. If
Archon adopts a neural model delta, call it a parameter delta or adapter and
bind it to the exact base checkpoint, architecture, tokenizer, and license.
Use G4LO only as a provenance and authorization analogy, not as a drop-in
training format.
