# ADR-0010 — Import/export: JSON + per-row report + two-level idempotency

- Status: accepted
- Context: Onboarding/offboarding needs a faithful, re-importable format with safe retries.
- Decision: JSON (schemaVersion + items with title/desc/status/priority/tags/dueDate).
  Import validates every row and returns `{accepted, rejected, rejectedRows[]}` with
  HTTP 200 (a partial success is not an error). Idempotency has two levels:
  (1) `clientProvidedId` dedupes rows across retries, (2) `idempotencyKey` suppresses
  whole duplicate POSTs. 500-row cap bounds abuse.
- Options considered: CSV (quoting/encoding pitfalls, poorer nesting for tags);
  all-or-nothing import (worse UX for client handovers); 409 on duplicates (hides progress).
- Consequences: clients can retry safely; rejection reasons never include secrets.
- Follow-ups: CSV export adapter if a client requires spreadsheets (R2).
