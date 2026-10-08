# ADR-0007 — Optimistic concurrency: ETag + If-Match over version

- Status: accepted
- Context: Lost updates must be impossible; spec prefers ETags/If-Match (RFC 9110).
- Decision: `ETag: "v{n}"` on reads; `If-Match` required on every todo mutation;
  mismatch → `412`, missing → `428`. Integer `version` remains the stored truth
  (ETag is its HTTP projection). Frontend keeps per-row ETags and rolls back on 412.
- Options considered: body-embedded version numbers (works but bypasses HTTP caching
  semantics and is easier for clients to forget); pessimistic locking (wrong for web).
- Consequences: clients must round-trip ETags (documented + tested); stale writes
  fail loudly instead of silently winning.
- Follow-ups: `If-None-Match` for list caching if traffic warrants it.
