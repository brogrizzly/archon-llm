# `@workspace/anchor-core`

Reusable deterministic validation, human authorization, encrypted event
storage, and recovery primitives for Archon/Anchor.

## Current mathematical boundary

The G4LO `Pi` operator and numerator semantics are not implemented or guessed.
Callers must provide runtime implementations whose identifiers and versions
match the pinned policy. If they are absent, the core returns
`UNRESOLVED_PI` or `NUMERATOR_SEMANTICS_UNCONFIGURED` and cannot prepare a
commit. The integration tasks must not treat a test fixture as the project's
mathematical definition.

The core accepts only six finite, explicitly encoded numeric coordinates
(`x`, `y`, `t`, `d`, `a`, `e`) with pinned units, positive scales, and a
configured threshold. Resource budgets are explicit inputs. It does not infer
attention or energy values.

## Authorization and state changes

- A proposal is bound to the pinned state revision, state digest, schema,
  policy, and ledger head.
- A registered human signs the exact proposal and evaluation-context digests
  with Ed25519. Archon output alone cannot authorize a commit.
- The core revalidates before commit and checks the expected revision again
  while holding the ledger's per-file process lock.
- Replayed proposal digests and authorization nonces are rejected.
- State and event payloads are encrypted with AES-256-GCM. The 32-byte key is
  passed to `FileAnchorLedger` at construction; it must come from an external
  secret-management system and must never be stored in this repository.
- SHA-256 is used separately for canonical proposal, state, event, and ledger
  digests.

## Local persistence boundary

`FileAnchorLedger` writes encrypted, append-only event snapshots through an
atomic temporary-file replacement and reconstructs state by replaying the
captured events. Its lock coordinates concurrent requests within one Node.js
process. It is suitable for local development and a single-process prototype,
not multiple server processes, network filesystems, or production scaling.
Those deployments need a transactional shared-database adapter before use.

The ledger directory should be private to the service account, backed up
securely, and excluded from source control. Rotate the vault key only through a
planned re-encryption procedure; losing it makes protected events unreadable.

## Development

- `pnpm --filter @workspace/anchor-core run typecheck`
- `pnpm --filter @workspace/anchor-core test`
- `pnpm run typecheck`

Tests use generated, in-memory Ed25519 test keys and a test-only mathematical
operator. Those fixtures do not define G4LO semantics and are not production
credentials.
