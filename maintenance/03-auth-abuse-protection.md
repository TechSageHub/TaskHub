# 03 — Security hardening: protect auth endpoints from scripted abuse

## Ticket
"Protect authentication endpoints from scripted abuse without harming UX."

## Decision: fixed-window per-IP rate limiting on `/api/v1/auth/*`
Chose rate limiting over progressive backoff/lockout because it is stateless-simple,
predictable for legitimate users, and easy to test: `AuthRateLimiter` (sliding
fixed window per client IP) returns `429 rate-limited` (Problem Details) with a
`Retry-After` header once the budget is exceeded, then blocks for a cooldown.

## Policy (all configurable)
| Setting | Env | Default | Meaning |
|---------|-----|---------|---------|
| MaxAttempts | `AUTH_MAX_ATTEMPTS` | 20 | requests per window per IP |
| WindowSeconds | `AUTH_WINDOW_SECONDS` | 60 | window length |
| BlockSeconds | `AUTH_BLOCK_SECONDS` | 300 | cooldown after exceeding |

20/min comfortably covers human login/register/retry behaviour while blunting
credential-stuffing scripts; legitimate users who trip it see a plain-language
"slow down" message with a retry time — no CAPTCHA friction, no account lockout
support burden.

## Tests
- Unit: limiter allows N, blocks N+1, reports positive retry-after.
- Integration `Rate_Limit_Returns_429_With_RetryAfter`: lowers the budget, fires three
  auth POSTs, asserts the third is 429 with a problem body (limiter reset afterwards
  so other tests are unaffected).

## Trade-offs & follow-ups
Does not distinguish attackers from NAT-shared offices (per-IP granularity) and does
not slow a distributed attack; a WAF/CDN limit and optional progressive lockout for
repeated 401s on one username are documented R2 steps. Login failures are also
audited (`auth.login_failure`) so abuse is visible.
