# ADR-0009 — Audit logging: same-save append-only entries, OrgAdmin-gated reads

- Status: accepted
- Context: Accountability for auth/todo/org events without a separate pipeline.
- Decision: audit entries appended to the same store snapshot in the same save as
  the mutation (no outbox, no gaps on crash after save). Entry =
  `{timestamp, actorUserId?, orgId, action, entityType, entityId, correlationId}`.
  No update/delete API; reads paged + OrgAdmin-only.
- Options considered: separate audit file/service (more moving parts, ordering gaps);
  logging-only audit (not queryable per org — fails the requirement).
- Consequences: audit inherits storage durability; background job writes
  actor=null entries with `background-archive` correlation.
- Follow-ups: tamper-evident chaining (hash-linked entries) if compliance needs it.
