# ADR-0005 — File storage: single JSON file, atomic temp+rename, semaphore gate

- Status: accepted
- Context: Must survive crashes and concurrent requests without partial/corrupt writes.
- Decision: one `taskhub-store.json`; all saves serialize the full snapshot to
  `*.tmp` then atomic `File.Move(overwrite:true)`; a process-wide `SemaphoreSlim(1,1)`
  serializes load/save. Simple, reviewable, crash-safe on filesystems with atomic rename.
- Options considered: one-file-per-org (more files/locks, same guarantees to prove);
  SQLite (a database — out of spirit); write-ahead log (overengineering).
- Consequences: write throughput is single-lane (fine for a small client app);
  full snapshots keep the code trivially correct.
- Follow-ups: sharding + fsync option if durability requirements tighten (R2).
