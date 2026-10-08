/**
 * toUserError: user-facing messages must be fixed, human-readable strings with
 * no technical leakage. Correlation IDs travel separately in `reference`,
 * never inside `message`.
 */
import { describe, expect, it } from 'vitest';
import { ApiError, toUserError } from '../api/client';

const REF = 'a9fa9abf8c6f4535a0d0d91cfac00395';

function apiError(status: number, code: string, detail = 'Some backend detail'): ApiError {
  return new ApiError(status, detail, { code, correlationId: REF });
}

describe('toUserError', () => {
  it('login failure is exactly "Username or password is incorrect." with no reference inline', () => {
    const e = toUserError(apiError(401, 'invalid-credentials', 'Username or password is incorrect.'));
    expect(e.message).toBe('Username or password is incorrect.');
    expect(e.message).not.toContain(REF);
    expect(e.message).not.toMatch(/ref/i);
    expect(e.reference).toBe(REF);
  });

  it('never embeds technical details for server/rate-limit/concurrency failures', () => {
    const cases = [
      apiError(500, 'internal-error', 'Object reference not set...'),
      apiError(429, 'rate-limited', 'Slow down and retry after 300s.'),
      apiError(412, 'precondition-failed', 'Version mismatch: expected "v3".'),
      apiError(428, 'precondition-required', 'Send If-Match with the current ETag.'),
      apiError(403, 'forbidden', 'Not a member of this organisation.'),
      apiError(404, 'not-found', 'Todo not found.'),
    ];
    for (const c of cases) {
      const e = toUserError(c);
      expect(e.message).not.toContain(REF);
      expect(e.message).not.toContain('ETag');
      expect(e.message).not.toContain('If-Match');
      expect(e.message).not.toContain('v3');
      expect(e.message).not.toMatch(/\(ref /);
    }
    expect(toUserError(apiError(500, 'internal-error')).message).toBe('Something went wrong. Please try again.');
    expect(toUserError(apiError(429, 'rate-limited')).message).toMatch(/wait a moment/);
  });

  it('maps network failures to a connection message without a reference', () => {
    const e = toUserError(new TypeError('fetch failed'));
    expect(e.message).toMatch(/Could not reach the server/);
    expect(e.reference).toBeUndefined();
  });

  it('maps known conflict codes to specific, safe messages', () => {
    expect(toUserError(apiError(409, 'username-taken')).message).toBe('That username is already taken.');
    expect(toUserError(apiError(409, 'already-member')).message).toMatch(/already a member/);
    expect(toUserError(apiError(409, 'last-admin')).message).toMatch(/last OrgAdmin/);
  });
});
