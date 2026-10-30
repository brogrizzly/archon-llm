# 4LO Repository Math Scan

## Scope

Read-only review of `brogrizzly/4lo`, branch `main` at commit
`62edfb6ad70897fa15ae87cec543641ba05eec18`, accessed 30 Oct. 2026. The
repository tree contains 146 math-, proof-, energy-, or geometry-related path
matches. This is a targeted review of the foundational math documents, selected
specifications, and representative implementation files—not a line-by-line
formal verification of all 146 paths.

Reviewed sources include the mathematical basis, cosine/L2 analysis, MathCore
axioms, correlated-authority prototype, equation-binding report, and selected
TypeScript implementations. Findings below describe what those sources state;
they do not establish that every formula is implemented or empirically valid.

## Findings

### Established mathematical tools

- The next-token probability, softmax, Shannon entropy, population-variance,
  Euclidean norm, cosine similarity, and linear interpolation equations are
  standard mathematical constructions, not G4LO inventions (G4LO, “G4LO
  Mathematical and Systems Basis”; G4LO, “Cosine Similarity and L2 Norm”).
- The worked cosine and L2 examples in the cosine/L2 document are arithmetically
  consistent. Its zero-vector warning is important: cosine similarity is
  undefined when either vector has zero norm. Its normalized-vector distance
  identity applies only when both vectors are L2-normalized.
- The entropy formula does not specify a logarithm base, so its units are
  unspecified. The variance expression shown is population variance; a sample
  variance would use a different denominator.

### G4LO-specific policies and prototype quantities

- Bounded-context updates, mode-scaled energy budgets, budget feedback, storage
  thresholds, and the “Rule of 6/11/36” are design rules or heuristics. The
  scanned documents do not provide empirical calibration for their constants
  or show that they are universal laws (G4LO, “G4LO Mathematical and Systems
  Basis”).
- The four-hour XP limit and fixed XP awards are product policies, not results
  derived by the accompanying “Human in the Loop” math document.
- The MathCore “postulates” define software invariants and authority boundaries.
  Their Euclidean presentation is organizational inspiration; the custom
  hashing, authorization, and replay rules are not propositions from Euclid’s
  *Elements* (G4LO, “MathCore Euclidean Axioms”).
- Day 26 defines `N_eff`, `κ`, and `E` as deterministic, structural prototype
  quantities. The document explicitly says they do not prove statistical
  independence or give calibrated confidence. The quorum and consequence
  equations are bounded engineering gates, not a production consensus proof
  (G4LO, “Day 26 Correlated Authority Prototype Formula”).

### Implementation cautions

- `calculateL2NormDelta` in `beltMath.ts` implements an L2-style distance over
  the union of object keys, but silently treats missing or nonnumeric values as
  zero. That can turn malformed or differently shaped state into a plausible
  distance; an explicit schema and rejection policy would be safer.
- `validateTensorIntegrity` checks for empty/non-finite values and near-zero
  variance. Variance alone does not establish matrix rank or singular-value
  collapse, so the `RANK_COLLAPSE` label overstates what this check proves.
- `applyDifferentialPrivacy` adds Gaussian noise using
  `sigma = sensitivity / epsilon`. This alone is not enough to establish a
  differential-privacy guarantee: the implementation does not specify the
  adjacency model, clipping, a `delta` parameter, composition accounting, or
  calibrated sensitivity. Treat it as experimental noise injection, not a
  privacy guarantee.
- `calculateTensorInverse` returns the elementwise negative of the input. That
  is an additive inverse, not a matrix inverse; the name should be changed or
  its intended operation clarified.
- `calculateNextState` uses `tanh(delta / 100)` and fixed update multipliers.
  The scanned sources do not derive or calibrate those constants.
- In `MathCore.validateProposal`, the representative path passes
  `riskWeight: 0` and assigns 36 chambers when the participant count is
  positive. Those values are fixed by the implementation path, not calculated
  from a risk model.
- The generated equation-binding report records three equations, zero
  citations, unresolved sources, and unbound equations at its recorded
  24 July 2026 scan. Treat that report as a dated diagnostic, not as proof that
  the current repository has been exhaustively checked (G4LO, “Equation
  Binding Report”).

## Attribution and use in Archon

Archon should credit G4LO for any borrowed implementation or project-specific
design. Cite Euclid only for the relevant classical geometry; do not attribute
G4LO’s state-transition, authorization, hash-chain, or quorum rules to Euclid.
The current project bibliography adds stable links to the reviewed G4LO sources.

For Archon model weights, keep a neural parameter delta `Δθ` distinct from a
G4LO state-change record. G4LO’s base-state and provenance binding can inform
the adapter manifest, but it does not define the tensor-delta format.

## License note

The repository does not contain an MIT license. Its root `LICENSE` is a custom
“G4LO License v1.1”; `LICENSE.md` points to `docs/LICENSE.md`, which is a
separate “4LO Studios Hybrid Commercial License.” These files state different
terms. This scan does not decide which governs. Archon already has a standard
MIT `LICENSE`, which I left unchanged. No 4LO source code was copied into this
report.

## Works Cited

See the project-wide [Works Cited](works-cited.md) for MLA 9 entries and
commit-pinned links to the G4LO documents, code, and license files reviewed.
