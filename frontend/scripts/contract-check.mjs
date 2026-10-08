/**
 * Contract check: verifies the hand-maintained types in src/api/types.ts stay
 * in sync with the backend OpenAPI schema.
 *
 * Usage: start the backend (STORAGE_PROVIDER=InMemory dotnet run), then
 * `npm run contract:check`. CI does this automatically.
 *
 * It asserts that every path the frontend calls exists in the OpenAPI document
 * with a compatible HTTP method. Full shape generation (openapi-typescript) is
 * the documented next step in docs/adr/0012-frontend-contract.md.
 */
const BASE = process.env.CONTRACT_API_URL ?? 'http://localhost:5000';

const EXPECTED = [
  ['post', '/api/v1/auth/register'],
  ['post', '/api/v1/auth/login'],
  ['post', '/api/v1/auth/logout'],
  ['get', '/api/v1/auth/csrf'],
  ['get', '/api/v1/auth/me'],
  ['post', '/api/v1/orgs'],
  ['get', '/api/v1/orgs'],
  ['get', '/api/v1/orgs/{orgId}/members'],
  ['post', '/api/v1/orgs/{orgId}/members'],
  ['patch', '/api/v1/orgs/{orgId}/members/{userId}'],
  ['delete', '/api/v1/orgs/{orgId}/members/{userId}'],
  ['post', '/api/v1/orgs/{orgId}/todos'],
  ['get', '/api/v1/orgs/{orgId}/todos'],
  ['get', '/api/v1/orgs/{orgId}/todos/{id}'],
  ['put', '/api/v1/orgs/{orgId}/todos/{id}'],
  ['patch', '/api/v1/orgs/{orgId}/todos/{id}/status'],
  ['delete', '/api/v1/orgs/{orgId}/todos/{id}'],
  ['post', '/api/v1/orgs/{orgId}/todos/{id}/restore'],
  ['delete', '/api/v1/orgs/{orgId}/todos/{id}/permanent'],
  ['get', '/api/v1/orgs/{orgId}/audit'],
  ['get', '/api/v1/orgs/{orgId}/export'],
  ['post', '/api/v1/orgs/{orgId}/import'],
];

const res = await fetch(`${BASE}/swagger/v1/swagger.json`);
if (!res.ok) {
  console.error(`Cannot reach backend OpenAPI at ${BASE}: HTTP ${res.status}. Start the backend first.`);
  process.exit(1);
}
const doc = await res.json();
let failed = 0;
for (const [method, path] of EXPECTED) {
  const entry = doc.paths?.[path];
  if (!entry || !entry[method]) {
    console.error(`MISSING: ${method.toUpperCase()} ${path} not in OpenAPI document`);
    failed++;
  }
}
if (failed > 0) {
  console.error(`${failed} contract mismatches. Update src/api/types.ts or the backend.`);
  process.exit(1);
}
console.log(`Contract OK: ${EXPECTED.length} endpoints verified against backend OpenAPI.`);
