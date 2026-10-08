# 04 — Risk Register

Scale: Likelihood L/M/H, Impact L/M/H. Owner + early warning + mitigation for each.

| # | Risk (category) | L | I | Mitigation | Early warning |
|---|-----------------|---|---|------------|---------------|
| R-01 | Broken auth/session lets attackers in (security) | M | H | PBKDF2, HttpOnly+Lax cookies, CSRF tokens, generic login errors; integration tests | Failed-login anomalies; session anomalies in audit |
| R-02 | Cross-org data leakage via ID guessing (security) | M | H | Server-side membership check on every op; explicit cross-org tests | 403-rate spikes; audit reads from odd orgs |
| R-03 | Lost updates without concurrency control (technical) | M | H | ETag + If-Match required; 412 tests; optimistic UI rollback | 412-rate rise; user reports of overwritten todos |
| R-04 | File-store corruption on crash/concurrent write (technical) | M | H | Atomic temp+rename writes; semaphore gate; single-file layout; backup docs | Health readiness failures; JSON parse errors on boot |
| R-05 | Migration v1→v2 loses fields (technical) | L | H | Pure migration function + fixture test; backup before migrate; readiness gate | Migration log line with unexpected counts |
| R-06 | Brute-force credential stuffing (security) | H | M | Fixed-window rate limiting + 429; generic errors; configurable limits | 429-rate rise; repeated 401s per IP in audit |
| R-07 | CSRF on state-changing endpoints (security) | M | M | Double-submit token + SameSite=Lax; documented; tested implicitly by clients | Unexpected 403 CSRF failures after deploy |
| R-08 | Audit gaps destroy accountability (operational) | L | H | Audit inside the same save as the mutation; integration tests assert entries | Post-incident template; periodic audit-count check |
| R-09 | Import of hostile/large payloads (security/ops) | M | M | 500-row cap, per-row validation, no sensitive data in errors, idempotency keys | Rejection-rate spikes; slow import timings |
| R-10 | E2E flakiness blocks CI signal (delivery) | M | M | Deterministic seeds, generous timeouts, trace-on-failure, workers share nothing | Flaky-test quarantine process in test strategy |
| R-11 | Scope creep in docs (delivery) | M | L | Time-boxed docs; P0-first ordering; final audit gates submission | Backlog growth without point re-estimate |
| R-12 | Archive job deletes/hides wrong todos (product) | L | M | Only Done + older-than-N-days + restorable; default-hidden not deleted; tests | Archive-count log vs expectation mismatch |

Top residual risks after mitigation: R-04 (single-file scale limits — see BK-37),
R-06 (no CAPTCHA/progressive lockout yet — documented in maintenance/03),
R-10 (browser CI variance — mitigated with retries/traces, not eliminated).
