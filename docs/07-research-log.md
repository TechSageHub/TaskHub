# 07 — Research Log

Each source lists the concrete decision it influenced in this repo.

1. **OWASP ASVS v5.0** (https://owasp.org/www-project-application-security-verification-standard/)
   — Topic: auth/session/password/CSRF verification levels.
   Decision: PBKDF2 with high iteration count, session inactivity handling, CSRF on
   state-changing requests, generic auth errors. Consequence: `PasswordHasher`,
   double-submit CSRF, rate limiting, mapped in threat model §11.
2. **OWASP Top 10:2025** (https://owasp.org/Top10/)
   — Topic: top web-app risk categories (broken access control, crypto failures, injection…).
   Decision: structured the STRIDE threat model around these; enforced server-side
   membership checks (A01), PBKDF2 + secure cookies (A02/A07), per-row validation (A03).
3. **Microsoft: “Prevent CSRF with antiforgery” / SameSite cookie guidance for ASP.NET Core**
   (https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery/)
   — Topic: SameSite=Lax vs Strict, double-submit vs synchronizer tokens for SPAs.
   Decision: HttpOnly session cookie (SameSite=Lax, Secure=SameAsRequest) + readable
   CSRF cookie echoed in `X-CSRF-Token`. Consequence: `Application/Security.cs`.
4. **RFC 9110 (HTTP Semantics), §13 Conditional Requests — ETag/If-Match**
   (https://www.rfc-editor.org/rfc/rfc9110#name-conditional-requests)
   — Topic: `ETag`, `If-Match`, `412 Precondition Failed`, `428 Precondition Required`.
   Decision: version-derived ETags `"v{n}"`, If-Match required on all todo mutations,
   412 on mismatch. Consequence: `Endpoints.cs` Mutate() + concurrency tests.
5. **RFC 9457 (Problem Details for HTTP APIs, obsoletes RFC 7807)**
   (https://www.rfc-editor.org/rfc/rfc9457)
   — Topic: `type/title/status/detail` + extensions for errors.
   Decision: uniform `application/problem+json` envelope with `code` + `correlationId`
   + field `errors`. Consequence: `Api/Contracts.cs` Problems helper.
6. **MDN: HTTP cookies — SameSite attribute**
   (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
   — Topic: Lax-by-default behaviour, top-level navigation vs fetch CSRF exposure.
   Decision: Lax (not None) so cross-site fetch cannot carry the session; CSRF token
   still required for defence in depth. Documented in README security notes.
7. **NIST SP 800-63B (password hashing / memorized secrets)**
   (https://pages.nist.gov/800-63-3/sp800-63b.html)
   — Topic: salted, iterated, adaptive KDFs; no composition rules; no hints.
   Decision: PBKDF2-SHA256 210k iterations + random 128-bit salt; 8–128 char passwords
   without composition rules; identical generic login failures.
8. **Microsoft: “Session and state management in ASP.NET Core”**
   (https://learn.microsoft.com/en-us/aspnet/core/fundamentals/app-state)
   — Topic: server-side session storage vs cookie payloads.
   Decision: opaque server-side sessions (revocable, logout-safe) persisted in the
   same store as domain data, not JWT-in-cookie.
9. **Swashbuckle.AspNetCore docs (OpenAPI generation)**
   (https://github.com/domaindrivendev/Swashbuckle.AspNetCore)
   — Topic: minimal-API OpenAPI output + Swagger UI.
   Decision: Swashbuckle for `/swagger/v1/swagger.json` + UI; `contract:check`
   script pins frontend expectations to it.
10. **Martin Fowler: “C4 model” / arc42 layering guidance**
    (https://c4model.com/)
    — Topic: context/container/component diagrams for handover.
    Decision: docs/08-architecture.md uses C4 with Mermaid so diagrams are
    reproducible in GitHub without binary assets.
11. **OWASP Testing Guide / ASVS 2.x rate-limiting notes**
    (https://owasp.org/www-project-web-security-testing-guide/)
    — Topic: anti-automation for auth endpoints.
    Decision: fixed-window per-IP limiter with 429 + Retry-After (maintenance/03),
    integration-tested, instead of CAPTCHA (UX cost).
