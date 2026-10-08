# TaskHub

Multi-tenant to-do platform (Elios take-home): organisations with Member/OrgAdmin RBAC,
todos with optimistic concurrency, audit logging, import/export, InMemory + File storage,
cookie-session auth with CSRF + rate limiting, archive background job. React + TypeScript
frontend, .NET 10 backend.

## Architecture overview
- `backend/TaskHub.Api` — minimal-API layers: `Api/` (thin endpoints, DTOs, Problem
  Details), `Application/` (validation, PBKDF2 hashing, sessions/CSRF/rate-limit,
  archive job), `Domain/` (records), `Infrastructure/` (InMemory + File stores).
- `backend/TaskHub.Tests` — 23 xUnit tests (unit + `WebApplicationFactory` integration).
- `frontend/` — React SPA (`src/api/` typed client, `App.tsx` screens), Vitest tests,
  Playwright E2E (`e2e/flow-a,b.spec.ts`).
- `docs/` (charter → ops + 13 ADRs), `maintenance/` (bugfix, archive, abuse protection,
  release notes, post-incident), `CHANGELOG.md`.

## Prerequisites
.NET SDK 10, Node.js 20+ (24 used), npm. Playwright downloads Chromium on first E2E run.

## Local setup
```bash
# backend (InMemory — default)
STORAGE_PROVIDER=InMemory dotnet run --project backend/TaskHub.Api --urls http://localhost:5000
# backend (File storage; Windows PowerShell: $env:STORAGE_PROVIDER='File')
STORAGE_PROVIDER=File STORAGE_FILE_DIR=./data dotnet run --project backend/TaskHub.Api --urls http://localhost:5000
# frontend (dev, proxies /api → :5000)
cd frontend && npm install && npm run dev   # http://localhost:5173
```
Swagger UI: http://localhost:5000/swagger. Health: `/health/live`, `/health/ready`.

## Configuration
| Var | Default | Meaning |
|-----|---------|---------|
| `STORAGE_PROVIDER` | InMemory | `InMemory` or `File` |
| `STORAGE_FILE_DIR` | `./data` | file store directory (`taskhub-store.json`) |
| `ARCHIVE_AFTER_DAYS` | 30 | archive Done todos older than N days |
| `ARCHIVE_INTERVAL_SECONDS` | 3600 | archive job interval |
| `AUTH_MAX_ATTEMPTS` / `AUTH_WINDOW_SECONDS` / `AUTH_BLOCK_SECONDS` | 20 / 60 / 300 | auth rate limit |
| `COOKIE_SECURE` | SameAsRequest | `Always` in production (HTTPS) |

## Migrations
File boot auto-migrates `schemaVersion: 1` → 2 (backfills priority/tags/archived) and
logs the result; verify via `/health/ready` (`schemaVersion: 2`). Keep a `.bak` copy
before upgrading (see docs/12-ops-design.md).

## Tests
```bash
dotnet test backend/TaskHub.slnx                                  # backend (23 tests)
cd frontend && npm run test                                       # frontend (Vitest)
cd frontend && npm run contract:check  # needs backend on :5000   # OpenAPI sync check
cd frontend && npx playwright test                                # E2E Flows A + B (starts both servers)
```

## CI
`.github/workflows/ci.yml`: backend build+test (coverage artifact), frontend
lint+build+test, contract check vs booted backend, Playwright E2E (report + traces).

## Documentation map
`docs/01-project-charter.md` → `02-backlog` → `03-estimation-and-plan` →
`04-risk-register` → `05-requirements` → `06-data-and-privacy` → `07-research-log` →
`08-architecture` → `09-api-contract` → `10-data-model-and-state` → `11-threat-model` →
`12-ops-design` → `13-dependency-register` → `14-test-strategy`; ADRs in `docs/adr/`;
maintenance records in `maintenance/`.

## Troubleshooting
See docs/12-ops-design.md table (401/403/412/429/503 causes + fixes). Common: stale
cookies → log in again; 412 → reload latest version; 429 → wait per Retry-After;
ready 503 → restore store file from `.bak`.

## Known limitations & next steps
Single-node; absolute 24h sessions (no sliding/remember-me); no email invites, OIDC,
read-only role, or full-text search (R2 backlog BK-34–40); hand-maintained frontend
types pinned by CI check until codegen (BK-36); file store is single-file (shard later).

## Security notes
- **User enumeration**: login returns identical `401 invalid-credentials` for unknown
  user vs wrong password (plus timing padding); register conflicts reveal only that a
  username is taken (unavoidable for registration UX).
- **Sessions**: opaque 256-bit server-side tokens, `HttpOnly`, `SameSite=Lax`,
  `Secure=SameAsRequest` (`Always` in prod), 24h expiry, revoked on logout.
- **CSRF**: double-submit — readable `taskhub_csrf` cookie echoed in `X-CSRF-Token`
  on all unsafe methods (GETs exempt); mismatches → 403.
- **Abuse**: fixed-window per-IP rate limit on `/auth/*` → 429 + Retry-After (tunable).
- **Not logged**: passwords, hashes, session/CSRF tokens, full user objects.
  Errors never include stacks, internals, or file paths.
