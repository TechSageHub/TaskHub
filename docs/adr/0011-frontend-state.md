# ADR-0011 — Frontend state: local React state + typed fetch wrapper (no store lib)

- Status: accepted
- Context: Small SPA; global store (Redux/Zustand) and data-fetching libs (React Query)
  add learning curve and bundle weight for little gain here.
- Decision: `useState`/`useCallback` per panel + one typed `api()` wrapper (cookies,
  CSRF, correlation IDs, ETag passthrough, Problem Details → `ApiError`). Active org
  persists in `localStorage`. Optimistic toggle uses per-row sequence numbers so
  out-of-order responses cannot corrupt UI state (see maintenance/01).
- Options considered: React Query (caching/sync power — unjustified for this size);
  server-state-in-URL for filters (nice, deferred).
- Consequences: data flow is explicit and easy to review; filter state is not
  deep-linkable yet.
- Follow-ups: URL-synced filters + generated API client (R2, with ADR-0012).
