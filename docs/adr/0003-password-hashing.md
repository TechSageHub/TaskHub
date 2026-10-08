# ADR-0003 — Password hashing: PBKDF2-SHA256 via framework

- Status: accepted
- Context: Spec asks for bcrypt/Argon2-class hashing without native dependencies.
- Decision: `Rfc2898DeriveBytes.Pbkdf2` (SHA-256, 210k iterations, 128-bit salt),
  format `v1.{iters}.{salt}.{hash}`, constant-time verify. Versioned format allows
  future upgrades (e.g. Argon2id via a package) with transparent re-hash on login.
- Options considered: BCrypt.Net/Argon2 packages (extra supply chain + native deps);
  plain SHA-256 (unacceptable).
- Consequences: no new dependencies; ~100ms per hash on dev hardware (acceptable);
  login path adds 300ms uniform delay to blunt timing oracles.
- Follow-ups: Argon2id + pepper-from-env when a secrets story exists (R2).
