# 09 — API Contract

Base: `/api/v1`. Auth: cookie session (`taskhub_session`) + `X-CSRF-Token` header on
POST/PUT/PATCH/DELETE. Every request may carry `X-Correlation-Id` (generated otherwise);
every response echoes it; every error includes it.

## Pagination (convention)
Request: `?page=1&pageSize=20` (clamped 1..1000 / 1..100).
Response: `{ items, page, pageSize, total, totalPages }`.

## Filtering/sorting (todos)
`?status=Open|Done` `?overdue=true` `?tag=x` `?includeArchived=true`
`?includeDeleted=true` `?sort=createdAt|dueDate|priority` `?order=asc|desc`
(default `createdAt:desc`).

## Endpoints (with examples)
- `POST /auth/register` `{username,password}` → `201 {id,username}` + cookies.
  Ex: `{"username":"mara","password":"Password123!"}` → `{"id":"…","username":"mara"}`.
- `POST /auth/login` same shape → `200`. Failure → `401 {code:"invalid-credentials"}`.
- `POST /auth/logout` `{}` → `200 {ok:true}`.
- `GET /auth/csrf` → `200 {csrfToken}`. `GET /auth/me` → `200 {user, organisations[]}`.
- `POST /orgs` `{name}` → `201 {id,name}`. `GET /orgs` → `200 OrgDto[]`.
- `GET /orgs/{orgId}/members` → `200 MembershipDto[]`.
- `POST /orgs/{orgId}/members` `{username, role:"Member"|"OrgAdmin"}` → `201`.
- `PATCH /orgs/{orgId}/members/{userId}` `{role}` → `200`. `DELETE …` → `200`.
- `POST /orgs/{orgId}/todos` `{title, description?, status?, priority?, tags?, dueDate?, clientProvidedId?}`
  → `201 TodoDto` + `ETag: "v1"`. Replay of known `clientProvidedId` → `200` same row.
- `GET /orgs/{orgId}/todos?…` → `200 PageDto<TodoDto>`.
- `GET /orgs/{orgId}/todos/{id}` → `200 TodoDto` + ETag.
- `PUT /orgs/{orgId}/todos/{id}` (partial-update body) + `If-Match` → `200 TodoDto` + new ETag.
  Ex: `PUT … {title:"New"}` + `If-Match: "v1"` → `200` + `ETag: "v2"`.
- `PATCH /orgs/{orgId}/todos/{id}/status` `{status}` + If-Match → `200`.
- `DELETE /orgs/{orgId}/todos/{id}` + If-Match → soft delete `200`.
- `POST /orgs/{orgId}/todos/{id}/restore` + If-Match → `200`.
- `DELETE /orgs/{orgId}/todos/{id}/permanent` + If-Match (OrgAdmin) → `200`.
- `GET /orgs/{orgId}/audit?entityType?&page?&pageSize?` (OrgAdmin) → `200 PageDto<AuditEntry>`.
- `GET /orgs/{orgId}/export` → `200 {schemaVersion, orgId, exportedAt, items[]}`.
- `POST /orgs/{orgId}/import` `{items[], idempotencyKey?}` → `200 {accepted, rejected, rejectedRows[], duplicateRequest}`.
  Ex: import of 1 good + 1 bad row → `{"accepted":1,"rejected":1,"rejectedRows":[{"index":1,"reasons":["title: Title is required.",…]}]}`.
- `GET /health/live` → `{status:"up"}`. `GET /health/ready` → `{status:"ready", storage, schemaVersion}`.

## Errors (RFC 9457)
`application/problem+json`: `{type, title, status, code, correlationId, detail?, errors?}`.
Codes: `validation-failed` 400, `unauthorized` 401, `invalid-credentials` 401,
`precondition-required` 428, `rate-limited` 429, `forbidden` 403, `not-found` 404,
`already-member`/`username-taken`/`last-admin` 409, `precondition-failed` 412.

## Session lifecycle
Register/login set `taskhub_session` (HttpOnly, Lax, 24h) + `taskhub_csrf` (readable).
Logout deletes the server session + clears cookies. Expiry is absolute (24h).

## Contract consistency
Frontend types live in `frontend/src/api/types.ts`; `npm run contract:check`
verifies all 22 used endpoints against live `/swagger/v1/swagger.json` (CI runs it).
Migration path to generated client documented in `docs/adr/0012-frontend-contract.md`.
