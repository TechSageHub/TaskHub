# 12 — Operational Design

## Logging fields
Every request: `{timestamp, level, correlationId, method, path, status}` via
`ILogger` message templates + `BeginScope` (structured, never string-concatenated).
Security events add `username` (register/login only) or counts (archive job).
Never: passwords, hashes, session/CSRF tokens.

## Correlation ID
Client generates (`crypto.randomUUID`) and sends `X-Correlation-Id`; backend accepts
or mints, puts it in the log scope, echoes it as a response header, and includes it
in every Problem Details body. Frontend surfaces it as `(ref …)` in error messages.

## Health checks
- `GET /health/live` — process is up (no dependencies).
- `GET /health/ready` — storage reachable + schemaVersion current (migration done).
  File provider: ready fails (503) if the store file is unreadable/corrupt.

## Storage migrations
File boot: read `schemaVersion`; if 1 → `MigrateV1ToV2` (backfill priority=Medium,
tags=[], isArchived=false, clientProvidedId=null), log counts, persist atomically.
InMemory: nothing to migrate (fresh each boot). Migration unit-tested with a v1 fixture.

## File backup / restore
- Layout: `{STORAGE_FILE_DIR}/taskhub-store.json` (+ `.tmp` transient).
- Backup: copy the JSON file (ideally while the process is stopped, or accept
  crash-consistent copy — single atomic file is always parseable); keep `taskhub-store.json.bak`.
- Restore: stop process → replace file → start → verify `/health/ready` schemaVersion.
- Disaster: corrupt file → process fails ready-check loudly (no silent empty state);
  restore from `.bak` per runbook in README troubleshooting.

## Deployment assumptions
Single-node process (`dotnet run` / published output), env-configured
(`STORAGE_PROVIDER`, `STORAGE_FILE_DIR`, `ARCHIVE_AFTER_DAYS`, `AUTH_*`, `COOKIE_SECURE`).
No orchestrator required; CORS locked to localhost dev origins; production should
terminate TLS in front and set `COOKIE_SECURE=Always`.

## Failure handling / troubleshooting
| Symptom | Likely cause | Action |
|---------|--------------|--------|
| 401 everywhere | cookie cleared/expired | log in again |
| 403 CSRF on mutations | blocked third-party cookies / stale tab | reload tab, log in again |
| 412 on save | edited elsewhere | reload latest, re-apply |
| 429 on login | rate limit tripped | wait per Retry-After |
| ready 503 | corrupt store file | restore from .bak |
| import 0 accepted | schema mismatch | check rejectedRows reasons |
