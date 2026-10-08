# 10 — Data Model & State

## Entities & relationships
- **User** (id, username unique, passwordHash, createdAt)
- **Organisation** (id, name, createdByUserId, createdAt)
- **Membership** (orgId, userId, role ∈ {Member, OrgAdmin}) — composite key (orgId,userId);
  a user has 0..n memberships; an org has ≥1 (≥1 OrgAdmin invariant).
- **Todo** (id, orgId, title, description, status, priority, tags[], dueDate?,
  createdAt, updatedAt, version, isDeleted, isArchived, clientProvidedId?)
- **AuditEntry** (id, timestamp, actorUserId?, orgId, action, entityType, entityId, correlationId)
- **Session** (token, userId, csrfToken, createdAt, expiresAt)

```
User 1──n Membership n──1 Organisation 1──n Todo
User 1──n Session        Organisation 1──n AuditEntry
```

## Invariants
- Org scoping: every todo/member/audit access requires a Membership row for (user, org).
- Role rules: membership changes + audit reads + hard delete require OrgAdmin;
  last OrgAdmin cannot be demoted/removed.
- Soft-delete: `isDeleted` rows hidden unless `includeDeleted`; restorable; hard delete
  destroys the row (OrgAdmin + If-Match).
- Archive: `isArchived` set only by the archive job (Done + older than N days);
  hidden unless `includeArchived`; restore clears both flags.
- Idempotency: `(orgId, clientProvidedId)` unique-on-create; `(orgId, idempotencyKey)`
  suppresses duplicate import POSTs.

## Todo state machine
```
        create
  ─────────────▶ OPEN ◀───restore──── DELETED ──── ─▶ (hard delete: gone)
                  │ ▲                  │
           toggle │ │ toggle     soft-delete
                  ▼ │                  ▼
                 DONE ──archive(N days)──▶ ARCHIVED ──restore──▶ OPEN/DONE
```
Deleted and archived are orthogonal flags; restore clears both; hard delete is terminal.

## Concurrency strategy
Integer `version` per todo, exposed as HTTP `ETag: "v{n}"`. All mutations
(update/status/soft-delete/restore/hard-delete) require `If-Match` equal to the
current ETag (weak form accepted); mismatch → 412; missing → 428. Each successful
mutation increments version. Same semantics in both storage providers because
versioning lives in the endpoint layer, not the store.
