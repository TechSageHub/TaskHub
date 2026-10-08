# ADR-0014 — Frontend redesign: SaaS dashboard shell + component split (no new deps)

- Status: accepted
- Context: The original frontend was a single 537-line `App.tsx` with unstyled,
  centered-container layout. For a client-ready handover it needed a professional
  dashboard shell, consistent components, dialogs, and responsive behaviour —
  without changing any API contract or losing functionality.
- Decision: (1) app shell with dark sidebar (branding, org switcher + create-org,
  nav with `aria-current`, user footer) + topbar + skip link, collapsing to a
  drawer under 960px; (2) split into `components/ui.tsx` (tokens-driven Button,
  Badge, Alert, Modal, EmptyState, SkeletonRows, PageHeader, StatCard, Pagination,
  Avatar) and feature panels (`AuthScreen`, `TaskDashboard`, `TaskModal`,
  `MembersPanel`, `AuditPanel`, `ImportExportPanel`); (3) single stylesheet with
  CSS variables for colors/spacing/radius/shadows; (4) task create/edit moved to a
  focus-managed modal (Escape closes, focus restored, no overlay-click data loss);
  import switched from raw-JSON paste to a file picker (same POST + idempotency);
  hard delete gets a confirm step; (5) no new dependencies.
- Options considered: a component library (MUI/Tailwind — heavy, new supply chain,
  against the minimal-dependency policy); keeping the single-file layout with only
  cosmetic CSS (fails the "not a developer prototype" bar).
- Consequences: accessible names used by component/E2E tests preserved (a few specs
  updated for the modal/file flows); dashboard adds derived stat cards via existing
  list totals (no API change); `TodoList` export kept for the toggle tests.
- Follow-ups: URL-synced filters, generated API client (per ADR-0012).
