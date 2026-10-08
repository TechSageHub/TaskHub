# 02 — Change request: archive completed todos older than N days

## Request
"Archive completed todos older than N days."

## Design
- **Mechanism**: in-process `BackgroundService` (`Application/ArchiveJob.cs`) — no
  external scheduler needed at this scale; interval configurable.
- **Configuration**: `ARCHIVE_AFTER_DAYS` (env, default 30; mirrors `Archive:AfterDays`)
  and `ARCHIVE_INTERVAL_SECONDS` (env, default 3600; mirrors `Archive:IntervalSeconds`).
  Short intervals make the behaviour testable without waiting days.
- **Meaning of "archive"**: `Todo.IsArchived = true` (with version bump + `todo.archived`
  audit entry, actor null, correlation `background-archive`). Archived rows are:
  - hidden from the default list,
  - visible with `?includeArchived=true` (UI checkbox "Show archived", pill badge),
  - restorable via the normal restore endpoint (clears archived + deleted flags).
- Only `Done`, non-deleted, non-archived rows older than the cutoff are eligible —
  Open work is never archived, and archiving never destroys data.

## Tests
- Backend integration `Archive_Job_Hides_And_Restore_Brings_Back`: marks a todo Done,
  back-dates it, runs `RunOnceAsync()`, asserts hidden-by-default / visible-with-flag.
- API contract + README updated (new query flag, new env vars).

## Operational notes
Job logs start parameters and per-iteration archived counts with structured logging.
To disable: set `ARCHIVE_AFTER_DAYS` very high (e.g. 36500). Restore runbook: use the
UI "Show archived" + Restore, or the restore endpoint directly.
