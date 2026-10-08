# 06 — Data Classification & Privacy Note

## Data stored
| Data | Classification | Notes |
|------|---------------|-------|
| username | **PII (identifier)** | 3–50 chars, login key. Minimal by design (no email/real name). |
| password hash (PBKDF2) | credential secret | Never reversible; verification only. |
| session token + CSRF token + expiry | session secret | Opaque random 256-bit values. |
| organisation name | business | Client/team name provided by user. |
| membership (user↔org + role) | access-control | Required for RBAC enforcement. |
| todo (title/desc/status/priority/tags/dueDate/timestamps/version/flags) | business | User content; may contain client-sensitive text — treat as confidential. |
| audit entries (actor/org/action/entity/correlationId) | operational | Accountability record; retained with store. |
| import idempotency keys | operational | Dedupe only. |

## Retention
Default: data lives as long as the store file/memory lives. Hard delete removes a todo
permanently (OrgAdmin). Sessions expire after 24h. No automated user-data purge in MVP
(documented limitation; a retention job is R2).

## Intentionally NOT stored
Emails, real names, passwords in cleartext, password hints, payment data, device
fingerprints, tracking identifiers, file attachments.

## Intentionally NOT logged
Passwords, password hashes, session tokens, CSRF tokens, full user objects.
Logs carry: timestamp, level, method, path, status, correlationId, username (on
register/login only), counts — never secrets. Errors return correlationId, never
stack traces or internal paths.
