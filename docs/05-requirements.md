# 05 — Requirements Specification

## Personas
1. **Mara the Member** — consultant juggling client todos across 2–3 organisations.
   Wants fast capture, filters, and offline-confidence that her edits never silently vanish.
2. **Omar the OrgAdmin** — delivery lead. Owns membership, needs a trustworthy audit trail
   for client reporting, and must be able to permanently remove sensitive todos.
3. **Priya the Client Observer** (third persona) — read-only stakeholder invited to one
   organisation to follow progress. (Supported as Member role with social convention;
   a true read-only role is R2 scope — see BK-34/38. She must never see other orgs.)

## Happy paths
- **Member (Mara)**: register → create org "Acme" → create 5 todos → filter Open →
  sort by due date → paginate → toggle Done (optimistic) → export JSON for the client.
- **OrgAdmin (Omar)**: register → create org → add Mara as Member → promote to OrgAdmin →
  view audit (sees member_added, role_changed) → soft-delete a stale todo → restore it →
  import a client list with 1 bad row → reads rejection report.

## Failure paths (8+)
1. Register with taken username → 409 `username-taken` (no password info leaked).
2. Login with wrong password OR unknown user → identical 401 `invalid-credentials`
   (no enumeration; 300ms timing padding).
3. Logged-out request → 401 `unauthorized` with correlationId.
4. Member opens another org's todo URL → 403 `forbidden`, no data.
5. Member opens audit log → 403; UI shows "Only OrgAdmins" notice.
6. Member attempts hard delete → 403 (integration-tested).
7. Update with stale ETag → 412 `precondition-failed`; UI rolls back + reloads.
8. Missing If-Match → 428 `precondition-required` with fix instructions.
9. Validation failure (empty title, bad tag, bad enum) → 400 with field-level `errors`.
10. Import with bad rows → 200 report `{accepted, rejected, rejectedRows[]}`; no secrets in reasons.
11. Duplicate import (same clientProvidedId / idempotencyKey) → no duplicates.
12. Auth flood → 429 `rate-limited` with Retry-After.

## Acceptance criteria per area
- **Auth**: register/login/logout/me behave per BK-01–03; sessions expire (24h);
  CSRF enforced on unsafe methods; rate limit configurable + tested.
- **Orgs/RBAC**: creator is OrgAdmin; only OrgAdmin manages members/views audit;
  last-admin guard; every endpoint checks membership (cross-org tests green).
- **Todos**: CRUD + toggle + soft/restore/hard delete; pagination envelope exact;
  sorting (createdAt, dueDate, priority × asc/desc); filters (status, overdue, tag);
  archived hidden by default, visible with flag, restorable.
- **Concurrency**: ETag on reads; If-Match on all mutations; 412 on mismatch (tested).
- **Audit**: all listed events recorded with timestamp/actor/org/action/entity/correlationId;
  role-gated reads; no passwords/tokens logged (verified by code inspection + tests).
- **Import/export**: export re-imports; report shape exact; idempotency proven by tests.
- **Storage**: both providers boot; file writes atomic; v1→v2 migrates (tested).
- **Observability**: correlationId end-to-end (header in, header out, in logs + errors);
  structured logs (template-based, no concatenation); live + ready health checks.
