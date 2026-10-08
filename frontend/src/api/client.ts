import { API_BASE, newCorrelationId } from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  correlationId?: string;
  fields?: Record<string, string[]>;
  constructor(status: number, message: string, extra: { code?: string; correlationId?: string; fields?: Record<string, string[]> } = {}) {
    super(message);
    this.status = status;
    this.code = extra.code;
    this.correlationId = extra.correlationId;
    this.fields = extra.fields;
  }
}

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Typed fetch wrapper. Sends X-Correlation-Id with every request, includes
 * session cookies, and attaches the double-submit CSRF token on unsafe methods.
 * Returns { data, etag } so callers can do If-Match concurrency control.
 */
export async function api<T>(path: string, options: {
  method?: string; body?: unknown; ifMatch?: string; query?: Record<string, string | number | boolean | undefined>;
} = {}): Promise<{ data: T; etag: string | null }> {
  const qs = options.query
    ? '?' + new URLSearchParams(Object.entries(options.query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()
    : '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Correlation-Id': newCorrelationId(),
  };
  if (options.ifMatch) headers['If-Match'] = options.ifMatch;
  const method = options.method ?? 'GET';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCookie('taskhub_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(API_BASE + path + qs, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const etag = res.headers.get('ETag');
  if (!res.ok) {
    let code: string | undefined; let fields: Record<string, string[]> | undefined;
    let correlationId: string | undefined = res.headers.get('X-Correlation-Id') ?? undefined;
    let message = `Request failed (${res.status})`;
    try {
      const b = await res.json();
      code = b.code; fields = b.errors; correlationId = b.correlationId ?? correlationId;
      message = b.detail || b.title || message;
    } catch { /* non-JSON error */ }
    throw new ApiError(res.status, message, { code, correlationId, fields });
  }
  if (res.status === 204) return { data: undefined as T, etag };
  const text = await res.text();
  return { data: (text ? JSON.parse(text) : undefined) as T, etag };
}

export function validateCredentials(username: string, password: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) errors.username = 'Username must be 3-50 chars: letters, numbers, . _ -';
  if (password.length < 8 || password.length > 128) errors.password = 'Password must be 8-128 characters.';
  return errors;
}

export function validateTodo(title: string, description: string, tags: string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!title.trim()) errors.title = 'Title is required.';
  else if (title.length > 200) errors.title = 'Title must be 200 characters or fewer.';
  if (description.length > 2000) errors.description = 'Description must be 2000 characters or fewer.';
  if (tags.length > 10) errors.tags = 'At most 10 tags.';
  else if (tags.some((t) => !/^[A-Za-z0-9_-]{1,30}$/.test(t))) errors.tags = "Tags: letters, numbers, - _ only (max 30).";
  return errors;
}

/**
 * User-facing error: a fixed, human-readable message plus an optional support
 * reference. The reference (backend correlation ID) is NEVER part of `message` —
 * it is only surfaced through a secondary "Error details" disclosure in the UI.
 */
export interface UserError {
  message: string;
  reference?: string;
}

/**
 * Maps any failure to a safe, fixed message keyed by machine-readable
 * `code`/status — never by backend detail text, so internal wording,
 * paths, or protocol terms can never leak into the UI.
 */
export function toUserError(err: unknown): UserError {
  if (err instanceof ApiError) {
    const reference = err.correlationId;
    switch (err.code) {
      case 'invalid-credentials': return { message: 'Username or password is incorrect.', reference };
      case 'username-taken': return { message: 'That username is already taken.', reference };
      case 'already-member': return { message: 'That user is already a member of this organisation.', reference };
      case 'last-admin': return { message: 'You cannot remove or demote the last OrgAdmin.', reference };
      case 'validation-failed': return { message: 'Please check the highlighted fields and try again.', reference };
      case 'unauthorized': return { message: 'Your session has expired. Please log in again.', reference };
      case 'forbidden': return { message: 'You do not have permission to do that.', reference };
      case 'not-found': return { message: 'The requested item was not found.', reference };
      case 'precondition-required': return { message: 'This action needs the latest version. Please reload and try again.', reference };
      case 'precondition-failed': return { message: 'This item changed elsewhere. Please reload and try again.', reference };
      case 'rate-limited': return { message: 'Too many attempts. Please wait a moment and try again.', reference };
      default: break;
    }
    // Fallback by status for codes the UI does not know (forward-compatible).
    switch (err.status) {
      case 400: return { message: 'Please check your input and try again.', reference };
      case 401: return { message: 'Your session has expired. Please log in again.', reference };
      case 403: return { message: 'You do not have permission to do that.', reference };
      case 404: return { message: 'The requested item was not found.', reference };
      case 409: return { message: 'That change conflicts with the current state. Please reload and try again.', reference };
      case 412: return { message: 'This item changed elsewhere. Please reload and try again.', reference };
      case 428: return { message: 'This action needs the latest version. Please reload and try again.', reference };
      case 429: return { message: 'Too many attempts. Please wait a moment and try again.', reference };
      default: return { message: 'Something went wrong. Please try again.', reference };
    }
  }
  if (err instanceof TypeError) {
    // Fetch throws TypeError on network failure / CORS / offline.
    return { message: 'Could not reach the server. Check your connection and try again.' };
  }
  return { message: 'Something went wrong. Please try again.' };
}
