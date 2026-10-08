import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError, validateCredentials } from '../api/client';
import { FieldError } from './ui';

const POINTS = [
  'Organisations keep every team\u2019s work cleanly separated.',
  'Optimistic updates with safe rollback on conflicts.',
  'Audit trail for members, tasks, and roles.',
];

/** Polished sign-in / registration screen. Accessible names preserved for tests + E2E. */
export default function AuthScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = validateCredentials(username, password);
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setBusy(true); setServerError(null);
    try {
      await api(mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register', { method: 'POST', body: { username, password } });
      onDone();
    } catch (err) {
      const ae = err as ApiError;
      if (ae.fields) {
        const flat: Record<string, string> = {};
        for (const [k, arr] of Object.entries(ae.fields)) flat[k] = arr.join(' ');
        setErrors(flat);
      } else setServerError(ae.message + (ae.correlationId ? ` (ref ${ae.correlationId})` : ''));
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <div className="auth-brand">
        <h1><span className="brand-mark" aria-hidden="true">T</span> TaskHub</h1>
        <p>Multi-tenant task management for teams. Organisations, roles, audit trails, and safe concurrent editing — in one place.</p>
        <ul className="auth-points">
          {POINTS.map((p) => <li key={p}><span className="tick" aria-hidden="true">✓</span><span>{p}</span></li>)}
        </ul>
      </div>
      <div className="auth-form-col">
        <div className="auth-card">
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="auth-sub">{mode === 'login' ? 'Sign in to your workspace.' : 'Get started with your own workspace.'}</p>
          <div className="auth-switch" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')}>Log in</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => setMode('register')}>Register</button>
          </div>
          <form onSubmit={(e) => void submit(e)} noValidate>
            <div className="field">
              <label htmlFor="auth-username">Username</label>
              <input
                id="auth-username" name="username" autoComplete="username" autoFocus
                value={username} onChange={(e) => setUsername(e.target.value)}
                aria-invalid={!!errors.username}
                aria-describedby={errors.username ? 'auth-username-err' : undefined}
              />
              <FieldError id="auth-username-err" message={errors.username} />
            </div>
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password" name="password" type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'auth-password-err' : 'auth-password-hint'}
              />
              {!errors.password && mode === 'register' && <span id="auth-password-hint" className="field-hint">At least 8 characters.</span>}
              <FieldError id="auth-password-err" message={errors.password} />
            </div>
            {serverError && <p className="alert alert-error" role="alert">{serverError}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
          <p className="auth-alt">
            {mode === 'login' ? (
              <>New to TaskHub? <button type="button" onClick={() => setMode('register')}>Create an account</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => setMode('login')}>Log in</button></>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
