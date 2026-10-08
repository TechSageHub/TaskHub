# 13 — Dependency Register

Policy: minimal dependencies; every non-framework package justified here.

## Backend (`backend/TaskHub.Api`)
| Package | Version | Purpose | Why needed / alternatives | Risk |
|---------|---------|---------|---------------------------|------|
| Swashbuckle.AspNetCore | 6.8.1 | OpenAPI JSON + Swagger UI | Required deliverable (OpenAPI). Alternative (built-in `Microsoft.AspNetCore.OpenApi` + Scalar UI) would add equal weight; Swashbuckle is the stable, documented choice. | Low: mature, build-time + runtime doc endpoint only |
| (framework only otherwise) | .NET 10 | Runtime, Kestrel, minimal APIs, PBKDF2 (`Rfc2898DeriveBytes`), rate-limit primitives | No extra packages for hashing/sessions — deliberate, avoids supply-chain surface | — |

## Backend tests
| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| Microsoft.AspNetCore.Mvc.Testing | 10.0.0 | In-process integration tests (WebApplicationFactory) | Low: test-only |
| xUnit (+ runner, coverlet) | 2.9.3 | Test framework + coverage | Low: test-only |

## Frontend (`frontend/`)
| Package | Version | Purpose | Why / alternatives | Risk |
|---------|---------|---------|--------------------|------|
| react / react-dom | 19.x | UI | Required stack | Low |
| vite / @vitejs/plugin-react | 8.x / 6.x | Build + dev proxy | Required toolchain | Low |
| typescript | 6.x | Types | Required stack | Low |
| vitest / jsdom / @testing-library/* | 5.x / 30.x / 16.x | Component + unit tests | Required test levels | Low: dev-only |
| @vitest/coverage-v8 | 5.x | V8 coverage provider (`npm run test -- --coverage`) | Required by CI coverage step; default provider for Vitest 5 | Low: dev-only |
| @playwright/test | 1.64 | E2E (Flows A + B) | Required E2E; no lighter credible option | Low: dev-only, browsers downloaded on demand |
| oxlint | 1.x | Lint | Lightweight, fast; replaces heavier eslint setup | Low: dev-only |

Deliberately avoided: UI frameworks, state libraries (local state suffices),
client gen (documented R2 step), CSS frameworks (hand CSS suffices), JWT libs
(server sessions need none), BCrypt package (framework PBKDF2 suffices).
