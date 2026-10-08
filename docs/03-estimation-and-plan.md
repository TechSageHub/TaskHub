# 03 — Estimation & Delivery Plan

## Method: story points (team use)
- Scale: 1, 2, 3, 5, 8, 13 (Fibonacci). 1 ≈ half a day for one engineer who knows
  the codebase; 13 must be split.
- How a team uses it: each backlog item gets ainery estimate in planning poker
  (backend + frontend + docs perspectives vote). Velocity = points completed per week;
  after 2 weeks the release forecast is re-computed as remaining_points / velocity.
- Definition linkage: points include implementation + tests + docs + review, never
  code alone. Anything without acceptance criteria cannot be pointed.

## Sizing of this delivery (single engineer, 1 day)
Total R1 ≈ 110 points across 33 items; sequenced so vertical slices land early and
unblock testing (auth → orgs → todos → storage → UI → hardening).

## Week-by-week plan (as it would run for a real client, compressed here to one day)

| Week | Focus | Checkpoints |
|------|-------|-------------|
| 1 | Domain + auth + orgs/RBAC + todo CRUD + isolation tests | **Design review** (end of week 1): C4, API contract, data model approved |
| 2 | Concurrency, audit, import/export, file storage + migration | **Security review** (mid-week 2): threat model vs implementation, ASVS mapping |
| 3 | Frontend core + optimistic UI + E2E; archive job; rate limiting | **Pre-release review** (end of week 3): runbook, backup/restore drill, release notes |
| 4 | Hardening, full docs/ADRs, CI artifacts, handover | Client handover + post-incident template filed |

## Checkpoints detail
- **Design review**: reviewers confirm layering, storage abstraction, ETag approach,
  Problem Details shape, and pagination conventions before UI work starts.
- **Security review**: walk the STRIDE threat model (docs/11), verify cookie/CSRF/
  rate-limit behaviour with live tests, confirm nothing sensitive is logged.
- **Pre-release review**: fresh-clone install rehearsal, migration v1→v2 drill,
  backup/restore drill, rollback plan for the archive job flag.
