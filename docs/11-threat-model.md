# 11 — Threat Model (STRIDE)

Method: STRIDE per component. Status: ✅ implemented / 🔶 deferred (R2).

| # | Threat | Component | Risk | Mitigation | Status |
|---|--------|-----------|------|------------|--------|
| T-01 | Spoofing: credential stuffing on login | Auth | H | Rate limiting (429), PBKDF2 cost, generic errors | ✅ |
| T-02 | Spoofing: session hijack via XSS | Session cookie | H | HttpOnly, Lax, opaque server-side tokens, logout revokes | ✅ |
| T-03 | Spoofing: user enumeration via error/timing | Auth | M | Identical 401s + timing padding; no existence hints | ✅ |
| T-04 | Tampering: CSRF state changes | All unsafe endpoints | M | Double-submit token + SameSite=Lax | ✅ |
| T-05 | Tampering: IDOR / cross-org access | Todos/members/audit | H | Membership check on every op; cross-org tests | ✅ |
| T-06 | Tampering: privilege escalation to OrgAdmin | Membership | H | Only OrgAdmin changes roles; last-admin guard | ✅ |
| T-07 | Tampering: lost updates (concurrent edit) | Todos | M | ETag + If-Match, 412; UI rollback | ✅ |
| T-08 | Tampering: audit tampering/deletion | Audit log | M | Append-only (no delete API); same-save writes | ✅ |
| T-09 | Tampering: file-store corruption | FileStore | H | Atomic temp+rename; semaphore; schemaVersion; backups | ✅ |
| T-10 | Repudiation: missing audit for sensitive ops | Audit | M | login success/failure, logout, all todo/org mutations audited | ✅ |
| T-11 | Info disclosure: stack traces / paths in errors | Error handling | M | Problem Details only; global handler; no internals | ✅ |
| T-12 | Info disclosure: secrets in logs | Logging | M | Never log passwords/tokens/hashes; review-gated | ✅ |
| T-13 | Info disclosure: export of other org's data | Export | M | Membership check; org-scoped query | ✅ |
| T-14 | DoS: auth-endpoint abuse | Auth | M | Fixed-window limiter + Retry-After; configurable | ✅ |
| T-15 | DoS: giant import payloads | Import | M | 500-row cap, per-row validation, bounded page sizes | ✅ |
| T-16 | Elevation: member hard-deletes / reads audit | RBAC | H | OrgAdmin-only gates + tests (403 for members) | ✅ |
| T-17 | Elevation: cookie Secure=None over HTTP | Cookies | L | Secure=SameAsRequest (secure on HTTPS); documented | ✅ |
| T-18 | Spoofing: no MFA / passwordless | Auth | M | Out of scope (R2: OIDC). Compensated by rate limits. | 🔶 deferred |

ASVS mapping (sample): 2.1.2 (password security — PBKDF2) ✅, 3.2 session binding ✅,
3.5 CSRF ✅, 4.1 access control ✅, 7.2 auth-failure handling ✅, 8.3 sensitive-data
minimisation ✅, 9.1 comms security (Secure/HttpOnly/Lax) ✅, 10.2 malicious-code
(import caps/validation) ✅.

**Residual risks / next:** T-18 (MFA/OIDC), single-file scale ceiling (BK-37),
no CAPTCHA/progressive lockout (maintenance/03 trade-off), no automated PII purge.
