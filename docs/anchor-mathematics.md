# Anchor mathematical specification

**Specification:** G4LO / Anchor 0.1

**Status:** Source formula recorded; execution semantics remain proposed and incomplete.

**Authority:** The supplied formula is preserved below. The operational notes are not a replacement for it.

## 1. Source formula

Original LaTeX, preserved as supplied:

```latex
\boxed{G4LO=\lim_{n\to 11}\Pi\!\left(\sum_{i=1}^{n}\frac{(x_i,y_i,t_i,d_i,a_i,e_i)}{\sqrt{\Delta x_i^2+\Delta y_i^2+\Delta t_i^2+\Delta d_i^2+\Delta a_i^2+\Delta e_i^2}}\right)}
```

Readable rendering:

$$
\boxed{G4LO=\lim_{n\to 11}\Pi\!\left(\sum_{i=1}^{n}\frac{(x_i,y_i,t_i,d_i,a_i,e_i)}{\sqrt{\Delta x_i^2+\Delta y_i^2+\Delta t_i^2+\Delta d_i^2+\Delta a_i^2+\Delta e_i^2}}\right)}
$$

The rendering is for readability only. Keep the source equation unchanged.

## 2. Intended coordinate meanings

The supplied outline assigns these meanings to the six coordinates:

| Symbol | Supplied meaning | Still required before calculation |
| --- | --- | --- |
| `x` | Workstation position: horizontal | Coordinate frame, origin, unit, and encoding |
| `y` | Workstation position: vertical | Coordinate frame, origin, unit, and encoding |
| `t` | Session continuity | A deterministic numeric encoding, unit, and reference |
| `d` | Data and ledger state | A deterministic numeric encoding and reference; a digest alone is not an ordered numeric coordinate |
| `a` | Attention burden | An explicit source, unit, encoding, and authorization rule |
| `e` | Human energy cost | An explicit source, unit, encoding, and authorization rule |

The meanings above come from the supplied outline; they do not define
measurement procedures. Anchor must not infer attention or energy values from
unstated sources. Coordinate frames, encoders, units, and privacy/authorization
rules must be declared and versioned before those values are used.

Let `i` index a participant in one instance. For each coordinate `j`, let
`p[i,j]` be its proposed value and `r[i,j]` its committed Anchor reference.
The proposed execution contract defines:

```text
delta[i,j] = encode[j](p[i,j]) - encode[j](r[i,j])
```

The reference must be captured from a pinned committed state. The evaluation
context must bind at least the instance and participant identities, state
revision and base-state digest, schema and policy versions, ledger head, and
exact proposal digest. A stale or mismatched binding is not eligible for
evaluation or commit.

## 3. Proposed discrete execution contract

The outline proposes `n` as an integer participant count from 1 through 11 for
each instance. At runtime, reject counts outside `1 <= n <= 11`. The equation's
limit notation is preserved, but this discrete cap does not itself define a
limit operation or establish convergence. No convergence claim is made.

For denominator evaluation, the outline proposes the Euclidean norm of the
normalized six-coordinate displacement. A possible notation for that
operational rule is:

```text
normalized_delta[i,j] = delta[i,j] / scale[j]
denominator[i] = sqrt(sum_j(normalized_delta[i,j] ** 2))
```

Each `scale[j]` must be declared, finite, strictly positive, and expressed in
the same unit as its coordinate. The coordinate encoding, frame, scale, and
their versions must be pinned for an evaluation. No default scales or silent
unit conversions are permitted. The formula itself is not being edited by this
notation.

### Unresolved numerator semantics

The supplied equation places `(x_i, y_i, t_i, d_i, a_i, e_i)` in the
numerator, while the proposed contract defines `Delta` as proposed coordinate
minus committed reference. It does **not** say whether the numerator means
absolute proposed coordinates, normalized coordinates, or displacements.
Those choices produce different results. The numerator also combines
coordinates that may have different units.

Therefore, do not substitute deltas into the numerator or evaluate the full
summand until the numerator's value, encoding, and normalization are specified
and versioned. The denominator contract alone is not enough to make the
equation executable.

## 4. `Pi` remains undefined

The supplied outline explicitly leaves `Pi` to be specified and notes that
other G4LO material has used it for both projection and proof records. This
specification chooses neither meaning.

Any implementation that reaches this operator must return an explicit
`UNRESOLVED_PI` result until a versioned definition establishes its domain,
codomain, behavior, and verification rules. It must not silently project,
create a proof record, or commit state as a fallback.

## 5. Numeric and boundary outcomes

These are proposed fail-closed execution outcomes. They make missing
configuration visible; they do not supply unprovided numerical policy.

| Condition | Required outcome |
| --- | --- |
| `n` is not an integer in `1..11` | Reject with `INVALID_PARTICIPANT_COUNT` |
| A coordinate encoder, frame, unit, or reference is missing | Reject with `COORDINATE_CONFIGURATION_MISSING` |
| A coordinate, encoded value, delta, scale, norm, or intermediate result is non-finite | Reject with `NON_FINITE_VALUE` |
| A scale is missing or is not strictly positive | Reject with `INVALID_SCALE` |
| All six canonically encoded proposed coordinates equal their committed references | Return `NO_OP`; do not divide, invoke `Pi`, or mutate the ledger |
| A non-no-op has a zero denominator | Return `UNDEFINED_DENOMINATOR`; do not divide or aggregate |
| The declared small-displacement threshold or its comparison rule is missing | Reject with `THRESHOLD_UNCONFIGURED` |
| A denominator meets the configured small-displacement rejection rule | Reject with `SMALL_DISPLACEMENT` |
| A denominator is exactly on the threshold boundary and the boundary rule is absent | Reject with `THRESHOLD_BOUNDARY_UNCONFIGURED` |
| The numerator interpretation or normalization is missing | Reject with `NUMERATOR_SEMANTICS_UNCONFIGURED` |
| `Pi` is required but has no accepted, versioned definition | Reject with `UNRESOLVED_PI` |
| The base revision, policy, schema, ledger head, or proposal digest is stale or mismatched | Reject with `STALE_OR_MISMATCHED_CONTEXT` |

The threshold value and boundary comparator are policy inputs and must be
declared, versioned, and included in the pinned evaluation context. Do not add
an epsilon to the denominator as an implicit substitute. A no-op is a separate
status, not a zero-denominator contribution.

## 6. Validation and authority boundary

Before aggregation, validate each participant's proposal independently:

- schema and declared coordinate units/encodings;
- finite values and configured coordinate constraints;
- fresh base state and legal transition;
- permissions, replay protection, and applicable battery, memory, and
  attention budgets;
- required cryptographic authentication.

Archon may produce a bounded proposal, but it cannot approve its own output,
modify policy, or write directly to the ledger. Human authorization must be
bound to the exact validated proposal digest. Accepted events are committed
atomically. Replaying captured proposals against the same pinned state and
rules must reconstruct the same canonical state; it must not depend on
regenerating identical LLM text.

For protected payloads, the outline specifies AES-256-GCM; use SHA-256
separately for digests. Key management, nonce policy, and authorization
protocol still require a security design before implementation.

## 7. Reference fixtures and properties

The Anchor implementation task should add deterministic fixtures for:

1. Participant counts `0`, `1`, `11`, and `12`; only `1` and `11` are valid
   boundary cases.
2. A single changed coordinate and multiple changed coordinates, with explicit
   test-only units, encoders, references, and positive scales.
3. Equal proposed and committed values, producing `NO_OP` without division.
4. A non-no-op whose normalized displacement norm is zero, producing
   `UNDEFINED_DENOMINATOR`.
5. Missing, zero, negative, non-finite, and differently versioned scales.
6. Missing coordinate encoders, mixed/unconverted units, and missing reference
   state.
7. Missing threshold, below-threshold, above-threshold, and exact-boundary
   cases using an explicitly configured test comparator.
8. Missing numerator interpretation and missing `Pi`; neither may produce a
   G4LO result.
9. Non-finite input and overflow during encoding or norm calculation.
10. A changed base revision, policy, schema, ledger head, or proposal digest.
11. Replaying the same captured inputs and pinned rules, which must reconstruct
    the same canonical result.

With finite encoded coordinates and finite, strictly positive scales, the
proposed denominator is nonnegative and is zero exactly when all six encoded
proposal-reference deltas are zero. This property does not define the
numerator or `Pi`. No other algebraic or geometric invariance is claimed
without a definition and derivation.

## 8. Open decisions before a complete executable specification

- What exactly does `Pi` do, and what does it return?
- What values and normalization belong in the numerator?
- What are the coordinate encoders, units, frames, and committed references?
- What are the scale values and how are they versioned?
- What small-displacement threshold and boundary comparator apply?
- How is session continuity represented?
- How are data and ledger state mapped to a numeric coordinate?
- What authorized sources and units define attention burden and human energy
  cost?
- Is the `n -> 11` limit notation intended as mathematical semantics beyond
  the discrete participant cap?
- What mathematical role does G4LO play in Archon beyond structuring state
  inputs, training examples, and deterministic evaluation?

## Version history

| Version | Status | Summary |
| --- | --- | --- |
| 0.1 | Proposed, incomplete | Preserves the supplied equation; records coordinate meanings and fail-closed execution boundaries; leaves `Pi`, numerator interpretation, and numeric policy unresolved. |
