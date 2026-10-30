# Guarded local Archon inference

## Current status

The local adapter connects Archon's Python pilot to the TypeScript Anchor core.
It is an integration boundary, not a claim that the pilot is useful, safe, or
production-ready. This workspace has no inference-ready checkpoint by default.
When one is absent, the adapter returns `CHECKPOINT_UNAVAILABLE`; it never
substitutes fixture text or a fabricated proposal.

The pilot's context length is 64 tokens. Oversized prompts are rejected rather
than truncated. The model can return invalid JSON or incomplete output; those
outputs are reported and are never repaired, extracted from surrounding prose,
or submitted to Anchor.

## Transition order

1. The caller supplies a versioned policy and a captured resource snapshot with
   source, device/domain, timestamp, quality, uncertainty, and explicit units.
2. The resource gate checks freshness, required memory/thermal/attention gates,
   and the optional job bound. Energy values must be in joules. Its budget is
   `max(0, available-energy lower bound - protected reserve - core upper bound - in-flight upper bound)`.
   Unknown required readings defer optional inference; battery percentage is
   not converted into energy.
3. Only after admission does Archon generate raw text. The adapter parses one
   strict JSON schema and rejects extra, missing, malformed, or oversized data.
4. Anchor validates the exact participant proposal against its current state,
   pinned policy, deterministic math operator, and transition policy. The
   unresolved `Pi`/numerator semantics remain fail-closed; no inference adapter
   selects them.
5. A trusted human signs Anchor's exact authorization intent. The adapter does
   not create signatures or approvals.
6. Before commit, the adapter checks that the resource policy and snapshot still
   match the proposal's captured resource context and that the snapshot remains
   fresh. Changed resource evidence requires `refreshResourceContext` and a new
   human authorization. Anchor rechecks state and authorization during commit.
7. The durable ledger is authoritative. Displays and other projections must
   remain downstream and cannot create proof of a commit.

## Audit and replay

The returned audit record captures the exact model output, model checkpoint
digest, request digest, resource snapshot, versioned resource policy, and
admission decision. The proposal ID is derived from those digests and the
captured Anchor state digest, so Anchor's proposal digest and human signature
bind that evidence without changing the Anchor core's schema or math.

Callers may replay the captured record through strict parsing, resource-policy
evaluation, and Anchor preparation without running the model or rereading
telemetry. Re-preparation requires the original Anchor base state to still be
current. After a commit, the durable ledger reconstructs the committed state
from its recorded event; keep the corresponding audit record available for
provenance checks.

The library returns audit records but does not persist them. A host application
must store them securely and consistently with its privacy policy; raw model
output may contain user-provided text. Do not log prompts or raw output.

## Integration boundary

The adapter is a reusable library, not an HTTP route. This project has no
configured production Anchor policy, authorizer, or resource telemetry source,
so exposing a commit endpoint would bypass necessary application-specific
controls. G4LO/Anchor code remains unchanged by this integration.

The adapter's tests use explicitly labeled test-only resource readings and a
test-only math operator. Those fixtures do not define production energy
measurements, `Pi`, numerator semantics, thresholds, or approval policy.
