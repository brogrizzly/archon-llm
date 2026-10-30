# Archon

Archon is an open-source language-model project; Anchor is the name for its mathematical foundation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
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

## Architecture decisions

- The mathematical definition and the model implementation must remain distinct and traceable.
- Unspecified equations, architecture, data, and evaluation details must be marked as open rather than filled in by assumption.

## Product

The project is currently documentation only. No runnable or trained model exists yet.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
