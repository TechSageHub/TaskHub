# ADR-0008 — Errors: RFC 9457 Problem Details everywhere

- Status: accepted
- Context: Consistent, debuggable, non-leaking errors across API + UI.
- Decision: uniform `application/problem+json` `{type,title,status,code,correlationId,
  detail?,errors?}` via a single `Problems` helper; global exception middleware maps
  the unexpected to 500 `internal-error` with no internals.
- Options considered: ad-hoc shapes per endpoint (inconsistent); exposing exception
  messages (leaks paths/queries — rejected).
- Consequences: frontend renders field errors and `(ref correlationId)` uniformly;
  operators can join client reports to server logs.
- Follow-ups: none planned; `type` URIs become docs links in R2.
