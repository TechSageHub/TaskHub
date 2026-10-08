# Changelog

All notable changes to TaskHub. Format follows Keep a Changelog (Unreleased / versions).

## [Unreleased]
### Changed
- Frontend redesigned as a professional SaaS dashboard: sidebar navigation with
  organisation switcher, task dashboard with statistics, task dialog, members table
  with add-member dialog, audit screen with filters and pagination, file-picker
  import, design-token stylesheet, responsive drawer navigation, skeletons and
  empty states. No API or behavioural changes; all existing tests updated and green
  (see docs/adr/0014-frontend-redesign.md).

## [1.0.0] - 2026-10-08
### Added
- Cookie-session auth (register/login/logout/me), PBKDF2 hashing, CSRF double-submit,
  generic login failures, secure cookie defaults.
- Organisations, memberships, Member/OrgAdmin RBAC, last-admin guards.
- Todo CRUD with pagination/filtering/sorting, status toggle, soft delete/restore,
  OrgAdmin hard delete, archive flag.
- ETag + If-Match optimistic concurrency (412/428) across all todo mutations.
- Audit logging (auth/todo/org/import/archive) with OrgAdmin-gated reads.
- JSON export + validated import with rejection reports and two-level idempotency.
- InMemory + File storage providers (atomic writes, locking, schemaVersion, v1→v2 migration).
- Problem Details errors with correlationId; structured logging; live/ready health checks.
- React + TypeScript SPA: auth, org switching, todos, members, audit, import/export,
  optimistic toggle with rollback, accessible labelled controls.
- Archive background job (`ARCHIVE_AFTER_DAYS`, configurable interval).
- Auth rate limiting (configurable, 429 + Retry-After).
- Swagger/OpenAPI + frontend contract check; Vitest + Playwright E2E (Flows A + B); CI.
### Fixed
- Rapid status toggling race: per-row sequencing + reload-before-error (maintenance/01).
### Security
- Auth abuse protection; STRIDE threat model; ASVS-mapped controls.
