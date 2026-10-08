# 01 — Project Charter: TaskHub

## Goal
Deliver a small but realistic multi-tenant to-do platform that a consultancy (Elios Technology Limited)
could hand over to a client: secure by default, testable, operable, and documented to handover quality.

## Success criteria
- A fresh clone runs with only Node.js + .NET SDK installed, following README steps.
- All required features work against **both** storage providers (InMemory, File).
- Multi-tenant isolation enforced server-side and proven by tests (no cross-org leakage).
- Optimistic concurrency conflicts are rejected (412) and proven by tests.
- Audit logs are written for auth/todo/org events and visible to OrgAdmin only.
- Import/export round-trips with validation + rejection reporting + idempotency.
- CI builds, lints, and tests backend + frontend on every push.
- Docs (planning → ops) and maintenance records exist and match the implementation.

## MVP boundaries (this delivery)
Authentication (register/login/logout, cookie sessions), organisations + RBAC
(Member/OrgAdmin), todo CRUD with pagination/filtering/sorting, soft delete/restore,
OrgAdmin hard delete, ETag concurrency, audit logging, JSON import/export, file storage
with v1→v2 migration, archive background job, auth rate limiting, E2E flows A + B.

## Later scope (explicitly out)
Email invitations/password reset, OAuth/OIDC, real-time collaboration, full-text search,
multi-file/sharded storage, horizontal scaling, native mobile clients, SLA-backed hosting.

## Constraints
- One-day delivery: prefer simple, robust implementations over clever ones.
- Tech: React + TypeScript frontend, .NET/C# backend, no managed DB (file or memory only).
- Must run offline-capable on a fresh machine (no cloud dependencies).

## Risks (summary; full register in 04-risk-register.md)
Security regression (auth/session), file-storage corruption, lost updates,
scope creep in docs, E2E flakiness in CI.

## Definition of done
Feature merged only when: implemented under /api/v1 or /frontend as specified,
covered by meaningful automated tests, documented (API contract + relevant docs/),
CI green, README verified from a clean checkout, no secrets/TODOs in the diff.

## Stakeholder assumptions
- **Client team**: cares about handover quality — README, runbook, ADRs, release notes.
- **End users (Members)**: want fast, keyboard-usable todo management.
- **OrgAdmins**: want membership control + trustworthy audit logs.
- **Elios reviewers**: score across the full SDLC, not just features.
