# ADR-0001 — Cookie session authentication (opaque server-side sessions)

- Status: accepted
- Context: Need login/logout for an SPA without a managed identity service. Options:
  (a) JWT in localStorage, (b) JWT in cookie, (c) opaque server-side sessions in cookie.
- Decision: (c). `taskhub_session` holds a 256-bit random token; server maps it to
  `{userId, csrfToken, expiry}` in the same `IDataStore`. 24h absolute expiry.
- Options considered: JWTs (stateless but hard to revoke; logout becomes best-effort);
  localStorage tokens (XSS-stealable, no HttpOnly protection).
- Consequences: logout truly revokes; sessions survive only with the store (File
  provider persists them); horizontal scale would need shared session storage.
- Follow-ups: sliding expiry / remember-me (R2); OIDC for SSO orgs (R2).
