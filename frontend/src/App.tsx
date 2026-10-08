import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from './api/client';
import type { OrgRef, UserDto } from './api/types';
import './App.css';
import AuditPanel from './components/AuditPanel';
import AuthScreen from './components/AuthScreen';
import ImportExportPanel from './components/ImportExportPanel';
import MembersPanel from './components/MembersPanel';
import { TodoList } from './components/TaskDashboard';

interface MeResponse { user: UserDto; organisations: OrgRef[] }

type View = 'todos' | 'members' | 'audit' | 'import';

const VIEWS: { id: View; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'members', label: 'Members' },
  { id: 'audit', label: 'Audit log' },
  { id: 'import', label: 'Import / Export' },
];

export default function App() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [orgs, setOrgs] = useState<OrgRef[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => localStorage.getItem('taskhub.activeOrg'));
  const [view, setView] = useState<View>('todos');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await api<MeResponse>('/api/v1/auth/me');
      setUser(data.user);
      setOrgs(data.organisations);
      if (data.organisations.length > 0 && !data.organisations.some((o) => o.id === activeOrgId)) {
        setActiveOrgId(data.organisations[0].id);
        localStorage.setItem('taskhub.activeOrg', data.organisations[0].id);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { void refreshMe(); }, [refreshMe]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function logout() {
    await api('/api/v1/auth/logout', { method: 'POST', body: {} });
    setUser(null); setOrgs([]); setActiveOrgId(null);
    localStorage.removeItem('taskhub.activeOrg');
  }

  function selectOrg(id: string) {
    setActiveOrgId(id);
    localStorage.setItem('taskhub.activeOrg', id);
    setView('todos');
    setNavOpen(false);
  }

  function goto(v: View) { setView(v); setNavOpen(false); }

  if (loading) return <main className="auth-form-col" style={{ minHeight: '100vh' }}><p role="status">Loading TaskHub…</p></main>;
  if (!user) return <AuthScreen onDone={refreshMe} />;

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;
  const role = activeOrg?.role ?? 'Member';
  const activeLabel = VIEWS.find((v) => v.id === view)?.label ?? 'Tasks';

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span className="brand-name">TaskHub</span>
          <button type="button" className="btn btn-sidebar drawer-close" style={{ width: 'auto' }} aria-label="Close navigation" onClick={() => setNavOpen(false)}>Close</button>
        </div>

        <div className="side-section">
          <span className="side-label" id="org-switch-label">Organisation</span>
          <div className="org-switch" role="group" aria-labelledby="org-switch-label">
            <label className="sr-only" htmlFor="org-select">Active organisation</label>
            <select id="org-select" value={activeOrgId ?? ''} onChange={(e) => selectOrg(e.target.value)}>
              <option value="" disabled>Select an organisation</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
            </select>
            {activeOrg && <span className="org-role">{activeOrg.name} · {role}</span>}
            <CreateOrgForm onCreated={(id) => { selectOrg(id); void refreshMe(); }} onError={setGlobalError} />
          </div>
        </div>

        <nav className="side-nav" aria-label="Organisation sections">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-current={view === v.id ? 'page' : undefined} onClick={() => goto(v.id)}>
              <span className="nav-dot" aria-hidden="true" />
              {v.label}
            </button>
          ))}
        </nav>

        <div className="side-footer">
          <span className="who"><strong>{user.username}</strong></span>
          {activeOrg && <span className="org-role">{role} · {orgs.length} organisation{orgs.length === 1 ? '' : 's'}</span>}
          <button type="button" className="btn btn-sidebar btn-sm" onClick={() => void logout()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      </aside>
      <button type="button" className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} tabIndex={-1} />

      <div className="main-col">
        <header className="topbar">
          <button type="button" className="btn btn-secondary btn-sm hamburger" aria-label="Open navigation" onClick={() => setNavOpen(true)}>Menu</button>
          <h1>{activeOrg ? `${activeOrg.name} — ${activeLabel}` : 'TaskHub'}</h1>
          <div className="topbar-right">
            <span className="who-text" aria-label="signed in as">Signed in as <strong>{user.username}</strong></span>
          </div>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>
          {globalError && <p className="alert alert-error" role="alert">{globalError}</p>}
          {activeOrg ? (
            <>
              {view === 'todos' && <TodoList orgId={activeOrg.id} />}
              {view === 'members' && <MembersPanel orgId={activeOrg.id} role={role} />}
              {view === 'audit' && <AuditPanel orgId={activeOrg.id} role={role} />}
              {view === 'import' && <ImportExportPanel orgId={activeOrg.id} />}
            </>
          ) : (
            <div className="card">
              <h2>No organisation selected</h2>
              <p style={{ color: 'var(--muted)' }}>Create an organisation from the sidebar to get started.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function CreateOrgForm({ onCreated, onError }: { onCreated: (id: string) => void; onError: (m: string | null) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { onError('Organisation name is required.'); return; }
    setBusy(true); onError(null);
    try {
      const { data } = await api<OrgRef>('/api/v1/orgs', { method: 'POST', body: { name: name.trim() } });
      setName(''); onCreated(data.id);
    } catch (err) { onError((err as ApiError).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={(e) => void create(e)} className="org-create">
      <label className="sr-only" htmlFor="org-name">New organisation name</label>
      <input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New organisation name" aria-label="New organisation name" />
      <button type="submit" className="btn btn-sidebar btn-sm" disabled={busy}>{busy ? 'Creating…' : 'Create organisation'}</button>
    </form>
  );
}
