# ADR-0012 — Frontend/API contract: shared-types module + CI check (codegen later)

- Status: accepted
- Context: Spec forbids hand-rolled types without proof of sync; full codegen costs
  implementation time today.
- Decision: hand-maintained `src/api/types.ts` mirroring `Api/Contracts.cs`, pinned by
  `npm run contract:check` (asserts all 22 used endpoints exist in live OpenAPI with
  compatible methods) — run in CI against a booted backend.
- Options considered: openapi-typescript codegen now (better long-term, slower today);
  unchecked duplication (fails the requirement — rejected).
- Consequences: contract drift breaks CI loudly; migrating to codegen later is
  mechanical (same schema, same check entrypoint).
- Follow-ups: switch to generated types + response-shape assertions (BK-36).
