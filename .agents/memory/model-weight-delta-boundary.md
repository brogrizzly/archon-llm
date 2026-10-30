---
name: Model deltas vs. G4LO WeightDelta
description: Distinguishes learned neural-network parameter changes from G4LO's state-change and provenance format.
---

G4LO's `WeightDelta` is a deterministic state-change record with base/result
digests, ordering, provenance, and validation boundaries. The Day 26 prototype
also uses “weight” for instrument-measured mass/force values. This is not a
LoRA adapter or a trainable tensor-delta format.

**Why:** The project owner wants Archon's trainable weights considered alongside
4LO; conflating the terms would misrepresent what Archon's checkpoint or a
future adapter contains.

**How to apply:** If Archon adopts a neural model delta, call it a parameter
delta or adapter and bind it to the exact base checkpoint, architecture,
tokenizer, and license. Use G4LO only as a provenance and authorization
analogy, not as a drop-in training format.
