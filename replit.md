# Paint & Signage Job Manager

A specialized job management system for paint and signage contractors — tracking jobs from initial lead through quoting, approval, scheduling, field work, compliance review, invoicing, and close.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/paint-signage run dev` — run the frontend (port 19361)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-set by Replit DB)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + TailwindCSS + shadcn/ui + React Query

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions: `users.ts`, `clients.ts`, `jobs.ts`, `estimates.ts`, `activity.ts`
- `artifacts/api-server/src/routes/` — Express route handlers: `users.ts`, `clients.ts`, `jobs.ts`, `estimates.ts`, `dashboard.ts`
- `artifacts/paint-signage/src/` — React frontend
- `lib/api-client-react/src/generated/` — auto-generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — auto-generated Zod schemas used by the server (do not edit)

## Architecture decisions

- **OpenAPI-first**: all types and hooks are generated from `openapi.yaml` — never hand-write what codegen produces
- **State machine for job stages**: transitions are validated server-side via `STAGE_ORDER` in `lib/db/src/schema/jobs.ts`. A job cannot skip from Lead to InProgress — it must pass through Quoting → Approved → Scheduled → InProgress
- **Estimate gate**: advancing a job to `Scheduled` or `InProgress` requires `hasApprovedEstimate = true`. The `/jobs/:id/advance-stage` endpoint enforces this
- **Auto-stage on estimate events**: creating an estimate on a Lead job automatically moves it to Quoting; approving an estimate automatically moves the job to Approved
- **Activity log**: every stage change and key event is recorded in the `activity` table, powering the recent activity feed on the dashboard
- **Margins computed server-side**: `computeEstimateTotals()` in `lib/db/src/schema/estimates.ts` calculates `internalCost`, `customerTotal`, `margin`, and `marginStatus` (Healthy ≥25%, Warning ≥15%, Critical <15%) from line items + markup percentage

## Product

- Dashboard with Kanban board of all jobs by stage, KPI summary cards, and recent activity feed
- Jobs list with search/filter, job detail with stage advancement and estimates panel
- Clients list and detail pages showing associated jobs
- Users list with role management (Admin, ProjectManager, Estimator, FieldCrew)
- Full CRUD for jobs, clients, users, and estimates via REST API

## Job Stage Flow

```
Lead → Quoting → Approved → Scheduled → InProgress → ComplianceReview → Invoiced → Closed
                 ^
                 Requires an approved estimate to advance past this point
```

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Never import `zod` or `zod/v4` directly in `artifacts/api-server/src/routes/` — it's not in the API server's esbuild bundle. Use schemas from `@workspace/api-zod` or use `.array()` methods on imported Zod schemas from `@workspace/db`
- After each OpenAPI spec change, always run codegen before using updated types: `pnpm --filter @workspace/api-spec run codegen`
- Route files in api-server must NOT use `return res.status().json()` — use `res.status().json(); return;` instead (Express 5 requirement)
- DB push: `pnpm --filter @workspace/db run push` — if column conflicts, use `push-force`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
