# 01 — Bugfix: rapid status toggling shows incorrect UI until refresh

## Ticket
"Rapid toggling of todo status sometimes shows incorrect UI state until refresh."

## Reproduction
1. Open a todo list with one Open todo ("Write report").
2. Click its "Mark done" toggle twice in quick succession (or click, then click again
   before the first response returns).
3. Observed (before fix): the pill could settle on the wrong status, or the conflict
   error from the losing request never appeared — the UI disagreed with the server
   until a manual refresh.
4. Expected: the UI always settles on the true server state, shows a clear message
   when a write loses a race, and stays usable.

## Root-cause analysis
Two compounding defects in `TodoList.toggle` (`frontend/src/App.tsx`):
1. **Out-of-order responses**: each toggle optimistically flipped local state and
   applied its response on arrival. A slower first request arriving after a faster
   second one overwrote the newer state with older data (classic last-writer-wins race).
2. **Error wipe**: the 412-conflict path called `load()`, which starts with
   `setError(null)` — erasing the "changed elsewhere" message the catch had just set,
   so users saw neither the error nor (reliably) the right state.

## Fix
- Per-row monotonically increasing **sequence numbers** (`seqRef`): a response only
  commits/rolls back if it belongs to the latest toggle for that row; superseded
  responses are ignored.
- On 412: `await load()` **first** (refresh authoritative state), then set the
  conflict message — so the reload can no longer wipe the error.

## Regression coverage
`frontend/src/__tests__/toggle.test.tsx`: (1) a 412 after an optimistic toggle rolls
back to server state, shows "changed elsewhere", and leaves the button enabled;
(2) a rapid double-toggle settles on the true server state rather than a phantom.
Notably, test (1) initially **failed** against the pre-fix code (no alert rendered),
which is how defect #2 was found — the test now guards both.

## Why it happened
Optimistic UI was added for responsiveness without accounting for request
reordering — the code assumed responses arrive in click order, which HTTP never
guarantees. Lesson: any optimistic mutation needs either sequencing or a single
in-flight guard; sequencing preserves snappiness and is the pattern adopted here.
