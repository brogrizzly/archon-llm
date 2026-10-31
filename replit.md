# Archon

Archon is an open-source language-model project; Anchor is the name for its mathematical foundation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- `python -m archon.validate_candidate` — validate the proposed 2B model count
- `python -m unittest discover -s archon/tests -v` — test the pilot pipeline
- `python -m archon.train --run-dir archon/runs/pilot` — run the CPU pilot
- In this Replit workspace, use `./.pythonlibs/bin/python` instead of `python`
  for those commands.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Python 3.13 for the independent Archon training pilot; PyTorch is pinned in
  `archon/requirements.txt`
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `README.md` — project overview and current status
- `anchor/` — Anchor mathematics source of truth and future implementation
- `archon/` — model specification and future implementation
- `docs/` — project brief, math worksheet, and model card
- `ROADMAP.md` — staged specification and implementation work

## Current agent handoff

The next pilot is planned around direct UTF-8 bytes with a fixed codec and no
learned subword tokenizer. Read [docs/utf8-byte-direction.md](docs/utf8-byte-direction.md)
and [AGENTS.md](AGENTS.md) before changing representation or training. The
existing code and smoke-test bundle still use BPE; the byte pilot is not yet
implemented. Preserve the published baseline and version the new work separately.

## Architecture decisions

- The mathematical definition and the model implementation must remain distinct and traceable.
- Unspecified equations, architecture, data, and evaluation details must be marked as open rather than filled in by assumption.

## Product

The project includes a small runnable BPE training pilot and a published
smoke-test checkpoint for reproducibility. No full-scale, general-purpose,
production, or quantized model release exists. The next byte pilot is planned
in [docs/utf8-byte-direction.md](docs/utf8-byte-direction.md).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
