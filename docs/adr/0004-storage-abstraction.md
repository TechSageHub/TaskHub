# ADR-0004 — Storage abstraction (IDataStore: InMemory + File)

- Status: accepted
- Context: Both providers mandatory, switchable by config, identical semantics.
- Decision: single `IDataStore` exposing the whole snapshot; endpoints depend only on
  the interface. `STORAGE_PROVIDER` env wins; `STORAGE_FILE_DIR` locates the file.
- Options considered: repository-per-entity (more interfaces, no benefit at this scale);
  EF Core/SQLite (a database in disguise — against the spirit of the exercise).
- Consequences: swapping providers is one env var; tests run InMemory for speed while
  semantics (versions, audit, sessions) stay identical.
- Follow-ups: per-org sharding if the single file grows (BK-37).
