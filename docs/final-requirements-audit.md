# Final Requirements Audit

Derived from `technical_exercise.pdf`. Status is evidence-backed (implementation +
tests), not aspirational.

| Requirement | Status | Implementation | Tests | Evidence |
|-------------|--------|----------------|-------|----------|
| React + TS frontend | Complete | `frontend/` (Vite, App.tsx, api/) | build + Vitest + Playwright | `npm run build`, 10 unit, 2 E2E green |
| .NET/C# backend, all routes `/api/v1` | Complete | `backend/TaskHub.Api`, `MapGroup("/api/v1")` | 24 backend tests | swagger lists all routes |
| InMemory storage (+version semantics) | Complete | `Infrastructure/Store.cs` `InMemoryStore` | full suite runs on it | CI + local runs |
| File storage (atomic, locked, schemaVersion, v1→v2) | Complete | `FileStore` (temp+rename, semaphore, migration) | migration unit + boot verification | manual boot: migrate 1 todo, restart persistence |
| Cookie/session auth, modern hashing | Complete | opaque sessions; PBKDF2-SHA256 210k | register/login/logout/me tests | 201+cookies observed |
| Secure cookie config (HttpOnly/Secure/SameSite) | Complete | HttpOnly+Lax+SameAsRequest (`Always` in prod) | Set-Cookie asserted in traces | documented README/ADR-0002 |
| CSRF strategy | Complete | double-submit `taskhub_csrf` + header | all unsafe test-client calls send it; 403 path exists | ADR-0002 |
| Auth abuse protection (rate limit) | Complete | `AuthRateLimiter`, 429+Retry-After | unit + integration | maintenance/03 |
| User-enumeration protection | Complete | identical 401s + timing padding | `Login_Failure_Does_Not_Reveal_Existence` | test asserts equal bodies |
| RBAC Member vs OrgAdmin | Complete | role checks in endpoints | member-403 tests (hard delete, audit) | integration green |
| Organisations/memberships/switching | Complete | CRUD + role change + UI switcher (localStorage) | member add/change/remove tests | E2E Flow B |
| Todo CRUD + toggle + soft/restore/hard delete | Complete | endpoints + UI | lifecycle integration test | E2E both flows |
| Pagination/filtering/sorting | Complete | envelope + sort/filter params | `Pagination_Sorting_Filtering_Work` | E2E Flow A |
| Validation + lengths + tags + enums | Complete | `TodoValidator` (shared by import) | unit theories | 400 field errors |
| Optimistic concurrency (ETag/If-Match, 412) | Complete | ETag `"v{n}"`, required If-Match | `Concurrency_Stale_Update_Rejected_With_412` | 412 + correlationId asserted |
| Audit logging (auth/todo/org + fields) | Complete | same-save entries, OrgAdmin-gated | audit assertions in lifecycle tests | E2E audit table |
| Import/export + report + idempotency | Complete | JSON, per-row validation, clientProvidedId + idempotencyKey | `Import_Validates_Reports_And_Is_Idempotent` | E2E rejection report |
| Problem Details + correlationId | Complete | `Problems` helper + middleware | `Health_And_Correlation_And_ProblemShape` | error bodies sampled |
| Structured logging (no concatenation) | Complete | ILogger templates + scopes | log output inspected | server logs in traces |
| Health live + ready | Complete | `/health/live`, `/health/ready` (storage check) | asserted 200 | CI + E2E webServer gate |
| OpenAPI + typed contract (no silent drift) | Complete | Swashbuckle + `contract:check` (22 endpoints) | CI job | `Contract OK: 22` |
| Frontend: auth/org/todos/filters/pagination/toggle | Complete | App.tsx screens | Vitest + E2E | Flow A green |
| Optimistic toggle rollback on failure | Complete | sequenced toggle + rollback + message | toggle.test.tsx (2) | caught a real bug pre-release |
| Loading + error states | Complete | role=status/error alerts throughout | rendering test | E2E-visible |
| Accessibility baseline | Complete | labels, names, keyboard-native controls, alerts | manual + axe-free review | no icon-only buttons |
| Backend unit tests (permissions/validation/concurrency/import) | Complete | TaskHubTests.cs | 24 pass | `dotnet test` |
| Integration (auth/session/tenant/audit/delete/migration/abuse) | Complete | same file | 24 pass | all areas covered |
| Frontend tests (validation/render/toggle/rollback) | Complete | `__tests__/` | 10 pass | `npm run test` |
| E2E Flow A + Flow B | Complete | `e2e/*.spec.ts` | 2/2 pass (Chromium) | traces on failure |
| Bugfix ticket + repro + regression | Complete | sequenced toggle | toggle tests | maintenance/01 |
| Archive job + config + tests + docs | Complete | `ArchiveJob`, flags | archive integration test | maintenance/02 |
| Auth abuse + config + tests + docs | Complete | rate limiter | unit + integration | maintenance/03 |
| Release notes + post-incident + CHANGELOG | Complete | maintenance/04, 05, CHANGELOG.md | — | files present |
| Docs 01–14 + ≥10 ADRs + README | Complete | `docs/`, `docs/adr/` (13), README | — | all required filenames |
| Backlog ≥30 + estimation + risks ≥10 | Complete | 40 items, points, 12 risks | — | docs/02–04 |
| Threat model ≥15 (named method) | Complete | STRIDE, 18 threats | — | docs/11 |
| Research log ≥10 + 3 personas + 8 failure paths | Complete | 11 sources, 3 personas, 12 paths | — | docs/05, 07 |
| CI (build/lint/test/artifacts) | Complete | `.github/workflows/ci.yml` | — | config present |
| No placeholders for required features | Complete | grep clean | — | scans above |

No Partial/Not-Complete items remain. Two genuine defects were found and fixed during
verification (frontend error-wipe on 412; file-store case-sensitive schemaVersion
lookup wiping data on restart) — both covered by new regression tests.
