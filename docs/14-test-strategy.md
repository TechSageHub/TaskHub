# 14 — Test Strategy

## Levels & rationale
- **Unit** (`backend/TaskHub.Tests/TaskHubTests.cs::ValidationTests`): pure logic —
  validation rules, password hashing, v1→v2 migration, rate-limiter math, ETag matching.
  Fast, no server.
- **Integration** (`TestFactory` + `ApiClient`, WebApplicationFactory, InMemory):
  auth flow + sessions, generic login failures, rate-limit 429, cross-org rejection,
  concurrency 412, soft/restore/hard-delete authorization, audit gating, import
  reporting + idempotency, pagination/sorting/filtering, archive job, health +
  correlation + problem shape. A cookie-aware client mirrors the SPA (cookies + CSRF).
- **Frontend/component** (Vitest + Testing Library): form validation, boot loading
  state, optimistic-toggle rollback incl. rapid double-toggle (regression for the
  maintenance/01 race).
- **E2E** (Playwright, real backend + Vite): Flow A (member) and Flow B (OrgAdmin)
  exactly as specified. Traces retained on failure.

## Naming
Backend: `<Area>Tests` classes, `Fact`s named `Subject_ExpectedBehaviour`
(e.g. `Cross_Org_Access_Rejected`). Frontend: `__tests__/<area>.test.{ts,tsx}`.
E2E: `e2e/flow-a.spec.ts`, `e2e/flow-b.spec.ts`.

## Test data
Randomised usernames per run (`Guid`/`Date.now` suffixes) so parallel workers and
repeat runs never collide; no shared fixtures; file-migration uses an inline v1 JSON
fixture. Production-shaped data (real validation paths, real cookies).

## Intentionally NOT tested
Password-hash cost benchmarking, visual/pixel assertions, formal WCAG audit with
assistive tech (manual keyboard/label checks only), multi-node concurrency (single
process by design), backup-restore automation (runbook only), load testing.

## CI execution
GitHub Actions (`ci.yml`): backend build + `dotnet test` (with coverage artifact),
frontend `npm run build` + `test` + `lint` + `contract:check` (backend booted as a
service step), Playwright E2E with trace artifacts. Lint/format gate both stacks.
