# 02 — Backlog & Release Plan

Estimation method: story points (Fibonacci, 1–13) — see 03-estimation-and-plan.md.
Priorities: P0 must-have (MVP), P1 should-have, P2 nice-to-have.

## MVP release (R1)

| ID | Title | Description | Acceptance criteria | Dependencies | Pts | Pri |
|----|-------|-------------|---------------------|--------------|-----|-----|
| BK-01 | User registration | Register with username + password, receive session cookie | 201 + cookies; duplicate username → 409; weak input → 400 with field errors | — | 3 | P0 |
| BK-02 | Login | Session login with generic failure message | 200 + cookies on success; wrong user OR wrong password → identical 401 `invalid-credentials` | BK-01 | 3 | P0 |
| BK-03 | Logout | Invalidate server session, clear cookies | Subsequent /me → 401; session removed server-side | BK-02 | 1 | P0 |
| BK-04 | Password hashing (PBKDF2) | Hash with PBKDF2-SHA256 210k iterations, constant-time verify | Unit test: correct verifies, wrong fails; hash format versioned | BK-01 | 2 | P0 |
| BK-05 | Auth rate limiting | Fixed-window limiter on /auth/*, configurable, 429 + Retry-After | Integration test: exceed limit → 429 with problem body | BK-02 | 3 | P0 |
| BK-06 | CSRF double-submit | `taskhub_csrf` cookie + `X-CSRF-Token` header required on unsafe methods | Unsafe without token → 403; safe GETs unaffected | BK-02 | 3 | P0 |
| BK-07 | Create organisation | Creator becomes OrgAdmin | 201; membership row created; audit `org.created` | BK-02 | 2 | P0 |
| BK-08 | Add member | OrgAdmin adds existing user by username | 201; non-admin → 403; unknown user → 404; duplicate → 409 | BK-07 | 2 | P0 |
| BK-09 | Change member role | OrgAdmin promotes/demotes | 200; last-admin demotion → 409; audit `org.role_changed` | BK-08 | 2 | P0 |
| BK-10 | Remove member | OrgAdmin removes member | 200; last-admin removal → 409; audit `org.member_removed` | BK-08 | 2 | P0 |
| BK-11 | Create todo | Validated create with ETag response | 201 + ETag; title/tag/enum validation → 400 field errors | BK-07 | 3 | P0 |
| BK-12 | List todos (paginate/sort/filter) | page/pageSize, sort createdAt/dueDate/priority, filter status/overdue/tag | Documented envelope `{items,page,pageSize,total,totalPages}`; tests for each axis | BK-11 | 5 | P0 |
| BK-13 | Update todo (If-Match) | Full/partial update requiring current ETag | Missing If-Match → 428; stale → 412; success bumps version | BK-11 | 3 | P0 |
| BK-14 | Status toggle (If-Match) | Open↔Done via PATCH …/status | Same concurrency rules; optimistic UI with rollback | BK-13 | 2 | P0 |
| BK-15 | Soft delete + restore | DELETE hides, POST …/restore recovers | Default list hides deleted; restore unhides; audit both | BK-11 | 3 | P0 |
| BK-16 | Hard delete (OrgAdmin) | DELETE …/permanent destroys row | Member → 403; audit `todo.hard_deleted` | BK-15 | 2 | P0 |
| BK-17 | Cross-org isolation | Every todo/audit/member op checks membership | Integration test: guessed IDs across orgs → 403, no data | BK-07 | 3 | P0 |
| BK-18 | Audit logging | Auth/todo/org events with actor, org, correlation | OrgAdmin reads paged log; Member → 403; no secrets logged | BK-02, BK-11 | 3 | P0 |
| BK-19 | Export JSON | Export org todos (re-importable fields) | Contains title/desc/status/tags/dueDate/priority | BK-12 | 2 | P0 |
| BK-20 | Import + report + idempotency | Validate each row; report accepted/rejected/reasons; clientProvidedId dedupe + idempotencyKey | Tests: rejection report shape; duplicate import adds nothing | BK-19 | 5 | P0 |
| BK-21 | InMemory provider | Default provider with full version semantics | All tests green on InMemory | — | 2 | P0 |
| BK-22 | File provider (atomic + locked) | Single JSON file, temp+rename writes, semaphore gate, schemaVersion | No partial writes; concurrent saves safe; crash test by code review + tests | BK-21 | 5 | P0 |
| BK-23 | v1→v2 migration + test | Detect schemaVersion 1, backfill priority/tags/isArchived | Migration unit test with v1 fixture; boot migrates automatically | BK-22 | 3 | P0 |
| BK-24 | Problem Details errors | RFC 9457 shape `{type,title,status,code,correlationId,errors?}` everywhere | No stacks/secrets; correlationId on every error; frontend shows ref | — | 3 | P0 |
| BK-25 | Correlation IDs + structured logs | Frontend sends `X-Correlation-Id`; backend scopes logs, echoes header | Log line contains correlationId; error bodies include it | BK-24 | 2 | P0 |
| BK-26 | Health endpoints | /health/live + /health/ready (storage check) | live 200 when up; ready reflects storage/migration state | BK-21 | 1 | P0 |
| BK-27 | OpenAPI + contract check | Swagger UI + `/swagger/v1/swagger.json`; `npm run contract:check` | All 22 endpoints verified in CI | BK-11 | 2 | P0 |
| BK-28 | Frontend core (auth/orgs/todos) | Login/register, org switch, CRUD, filters/sort/page, loading/error states | E2E Flow A green | BK-02, BK-12 | 8 | P0 |
| BK-29 | Optimistic toggle + rollback | Sequenced optimistic updates; 412 → rollback + message + reload | Component tests (incl. rapid double-toggle); bugfix note maintenance/01 | BK-14 | 5 | P0 |
| BK-30 | Members + audit UI | OrgAdmin member mgmt, audit table; Member sees forbidden state | E2E Flow B green | BK-08, BK-18 | 5 | P0 |
| BK-31 | Archive background job | Archive Done todos older than ARCHIVE_AFTER_DAYS; hidden by default, filterable, restorable | Tests; config documented; maintenance/02 | BK-15 | 5 | P0 |
| BK-32 | CI pipeline | Build + lint + backend tests + frontend tests + contract check + artifacts | Green on clean runner | BK-27 | 3 | P0 |
| BK-33 | Docs + ADRs + release notes | All /docs, 10+ ADRs, maintenance/, README, CHANGELOG | Final requirements audit all-Complete | — | 8 | P0 |

## Next release (R2, deferred)

| ID | Title | Notes |
|----|-------|-------|
| BK-34 | Email invites + password reset | Needs mail infra; out of MVP |
| BK-35 | OIDC/OAuth login | Replaces local passwords for SSO orgs |
| BK-36 | openapi-typescript generated client | Replace hand-maintained contract (ADR-0012 follow-up) |
| BK-37 | Per-org file sharding | Scale file storage beyond single JSON |
| BK-38 | Full-text search + saved views | Query power for large orgs |
| BK-39 | Accessibility audit (WCAG 2.2 AA) | Formal audit with assistive tech |
| BK-40 | Backup rotation + restore runbook automation | Scripted backup/restore drills |

## Sequencing
Auth (BK-01–06) → orgs/RBAC (BK-07–10) → todos (BK-11–16) → isolation/audit (BK-17–18)
→ import/export (BK-19–20) → storage (BK-21–23) → observability/API surface (BK-24–27)
→ frontend (BK-28–30) → maintenance/CI/docs (BK-31–33). R1 is the MVP release; R2 items
are ordered by client value after handover.
