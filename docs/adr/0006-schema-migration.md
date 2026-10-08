# ADR-0006 — Schema versioning + v1→v2 migration

- Status: accepted
- Context: File store must carry `schemaVersion` and prove a real migration.
- Decision: `schemaVersion` persisted; boot detects v1 (todos without
  priority/tags/isArchived/clientProvidedId) and backfills
  (Medium/[]/false/null), then persists v2 atomically. Migration is a pure static
  function covered by a fixture test.
- Options considered: lazy per-record migration (harder to reason about readiness);
  no-op "migration" (dishonest — rejected).
- Consequences: readiness reflects migration state; old files upgrade transparently
  with a log line; backup-before-migrate stays the operator's job (runbook).
- Follow-ups: migration journal + down-migration notes if v3 ever ships.
