# ADR-0013 — Testing & tooling: xUnit + Vitest/TL + Playwright, GitHub Actions

- Status: accepted
- Context: Must prove correctness at unit/integration/E2E levels with automation.
- Decision: xUnit + `WebApplicationFactory` (real HTTP incl. cookies) for backend;
  Vitest + Testing Library (jsdom) for frontend logic; Playwright (Chromium) for the
  two required flows with traces on failure; GitHub Actions `ci.yml` runs all plus
  lint (`oxlint`, `dotnet build` warnings) and the contract check, uploading test
  results and traces as artifacts.
- Options considered: NUnit/MSTest (no advantage); Cypress (heavier); no E2E
  (fails the requirement — rejected).
- Consequences: `main` stays green-or-reverted; flakes are quarantined per test strategy.
- Follow-ups: coverage thresholds once a baseline stabilizes.
