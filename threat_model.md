# Threat Model

**Status:** Prototype-focused review, 30 October 2026. This is a security
reference, not a certification or guarantee of safety.

## Project Overview

Archon is an independently trained language-model project. The current
checkpoints are small CPU reproducibility pilots, not useful or approved
general-purpose models. A TypeScript library can pass local model proposals to
the Anchor core, but it is not an HTTP route and has no configured production
authorizer, resource source, or commit endpoint. The HUD is a visual prototype
with no connected model runtime.

## Assets

- **Model weights, tokenizer, and manifests** — integrity and provenance must
  remain bound to the checkpoint used for inference.
- **Training corpus and source-rights records** — the current authored corpus
  has a separate license declaration; future data needs source-level review.
- **Prompts, raw outputs, and audit records** — may contain user-provided text.
  The inference library returns records but does not persist them. Prompts and
  raw outputs must not be logged.
- **Anchor authorization material, state, and ledger** — unauthorized or
  replayed transitions could corrupt the state history.
- **Workspace secrets and database credentials** — keep in secret storage; do
  not place them in source, fixtures, prompts, or logs.

## Trust Boundaries

- **User/developer to local model:** prompts and training inputs are untrusted;
  enforce byte, context, and schema limits.
- **Python inference to TypeScript adapter:** generated text is untrusted until
  strict parsing and validation succeed.
- **Resource snapshot to inference gate:** readings can be stale, incomplete,
  or expressed in invalid units; admission must fail closed.
- **Inference adapter to Anchor core:** model output is only a proposal;
  Anchor validates it against current state and policy.
- **Human authorizer to state transition:** only a trusted signer can authorize
  the exact intent; no production signer is configured.
- **HUD to model:** no connection currently exists. Treat future integration as
  a new boundary requiring review.
- **Workspace API/database:** these exist separately from the Archon inference
  path; no Archon inference route is documented or configured.

## Scan Anchors

- Python model, tokenizer, training, and local inference: `archon/`.
- Proposal boundary, resource gate, and replay validation:
  `lib/archon-inference/`.
- Deterministic state and authorization rules: `lib/anchor-core/` and `anchor/`.
- Project entry points and status: `README.md`, `AGENTS.md`, and `replit.md`.
- Documentation and evidence: `docs/`, `archon/data/README.md`, and checkpoint
  manifests.
- `artifacts/mockup-sandbox/` is a visual prototype, not a production inference
  surface.

## Threat Categories

### Spoofing

There is no production Archon inference endpoint or configured authorizer.
Future host applications must authenticate callers and bind signer identity to
the exact authorization intent. Do not treat a browser control or model output
as an authorization credential.

### Tampering

Checkpoint, tokenizer, manifest, resource snapshot, or proposal alteration can
change inference or state-transition behavior. Current code checks checkpoint
provenance, validates strict proposal schemas, and has Anchor recheck state and
authorization before commit. A dedicated tamper-resistant operational audit
store is not implemented.

### Repudiation

Anchor records state transitions in its ledger, and inference returns a
structured audit record with digests. The inference library does not persist
that record. No host-level audit retention/export service or production
incident process is configured.

### Information Disclosure

Prompts and raw output may contain user-provided text. The inference
documentation prohibits logging either; audit records must be protected if a
host stores them. Do not capture hidden chain-of-thought. No retrieval store or
external inference service is configured in this path.

### Denial of Service

The local inference boundary has request, prompt, token, and context limits, and
resource admission checks can defer optional work. There is no public Archon
inference endpoint today; rate limiting and service-level resource controls
remain necessary if one is introduced.

### Elevation of Privilege

The model cannot directly authorize or commit Anchor state, and the adapter
does not invoke external tools. A future tool integration could cross into
state-changing operations; require server-side authorization, explicit human
approval, least privilege, and a tested interrupt/rollback mechanism before
enabling it.

## Required Guarantees Before Deployment

- Keep inference private and local unless an external data flow is explicitly
  approved and documented.
- Reject invalid, incomplete, oversized, stale, or mismatched inputs instead of
  repairing them silently.
- Keep authorization independent of the model and revalidate immediately
  before state changes.
- Do not log prompts, raw outputs, credentials, or hidden reasoning traces.
- Document an owner, retention policy, access controls, incident process, and
  deployment-specific risk assessment before enabling telemetry or persistence.
