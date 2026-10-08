# 05 — Post-Incident Report (simulated): audit log gap

- Date: 2026-10-08 (simulation). Severity: medium. Duration: n/a (exercise).
- **Scenario**: "Audit log missing entries for a period."
- **Summary**: During a routine review, an OrgAdmin noticed task edits made on a
  Tuesday afternoon had no corresponding audit entries, while Wednesday edits did.
- **Timeline (simulated)**: Tue 14:00 — file-store volume filled; 14:05 — saves began
  failing after the mutation but the API still returned 200 in one code path (hypothetical);
  Wed 09:00 — admin report; 09:30 — disk freed, entries resume; 10:00 — review complete.
- **Root cause (simulated)**: audit writes rode along with the mutation save; when the
  save failed, neither persisted — but the response path did not surface the failure.
- **Why it can't happen here (by construction)**: in this codebase the audit entry is
  appended to the same snapshot *before* `SaveAsync`, and any save exception propagates
  through the global Problem Details middleware as a 500 — the client never receives a
  false 200, so "mutation without audit" cannot be silently observed. Integration tests
  assert audit rows exist after every covered operation.
- **Action items**: (1) keep the same-save pattern for any future store; (2) add a
  periodic audit-completeness check (count mutations vs audit rows) to ops;
  (3) alert on disk usage >80% for file-store deployments; (4) chaos-test: fill disk
  in staging and confirm 500s, not silent gaps.
- **Lessons**: audit must be atomic with the action it records; loud failures beat
  silent gaps; operator alarms (disk) are part of the audit story.
