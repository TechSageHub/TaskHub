import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError, validateCredentials, validateTodo } from './api/client';
import type { AuditEntry, ImportReport, MembershipDto, OrgRef, PageDto, TodoDto, TodoPriority, TodoStatus, UserDto } from './api/types';
import './App.css';

interface MeResponse { user: UserDto; organisations: OrgRef[] }

type View = 'todos' | 'members' | 'audit' | 'import';

export default function App() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [orgs, setOrgs] = useState<OrgRef[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => localStorage.getItem('taskhub.activeOrg'));
  const [view, setView] = useState<View>('todos');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function logout() {
    await api('/api/v1/auth/logout', { method: 'POST', body: {} });
    setUser(null); setOrgs([]); setActiveOrgId(null);
    localStorage.removeItem('taskhub.activeOrg');
  }

  if (loading) return <main className="wrap"><p role="status">Loading TaskHub…</p></main>;
  if (!user) return <AuthScreen onDone={refreshMe} />;

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;
  const role = activeOrg?.role ?? 'Member';

  return (
    <div className="wrap">
      <header className="topbar">
        <h1>TaskHub</h1>
        <div className="topbar-right">
          <span aria-label="signed in as">Signed in as <strong>{user.username}</strong></span>
          <button type="button" onClick={() => void logout()}>Log out</button>
        </div>
      </header>
      {globalError && <p className="error" role="alert">{globalError}</p>}
      <OrgBar orgs={orgs} activeOrgId={activeOrgId} onSelect={(id) => { setActiveOrgId(id); localStorage.setItem('taskhub.activeOrg', id); setView('todos'); }} onCreated={refreshMe} onError={setGlobalError} />
      {activeOrg ? (
        <>
          <nav aria-label="Organisation sections" className="tabs">
            {(['todos', 'members', 'audit', 'import'] as View[]).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                {v === 'todos' ? 'Todos' : v === 'members' ? 'Members' : v === 'audit' ? 'Audit log' : 'Import / Export'}
              </button>
            ))}
          </nav>
          {view === 'todos' && <TodoList orgId={activeOrg.id} />}
          {view === 'members' && <MembersPanel orgId={activeOrg.id} role={role} />}
          {view === 'audit' && <AuditPanel orgId={activeOrg.id} role={role} />}
          {view === 'import' && <ImportExportPanel orgId={activeOrg.id} />}
        </>
      ) : (
        <p>Create or join an organisation to get started.</p>
      )}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="error" role="alert">{message}</p>;
}

function AuthScreen({ onDone }: { onDone: () => void }) {
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
    <main className="wrap narrow">
      <h1>TaskHub</h1>
      <p>Multi-tenant task management for teams.</p>
      <div className="tabs" role="tablist" aria-label="Authentication mode">
        <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
        <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
      </div>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor="auth-username">Username</label>
        <input id="auth-username" name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} aria-invalid={!!errors.username} aria-describedby={errors.username ? 'auth-username-err' : undefined} />
        <FieldError id="auth-username-err" message={errors.username} />
        <label htmlFor="auth-password">Password</label>
        <input id="auth-password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'auth-password-err' : undefined} />
        <FieldError id="auth-password-err" message={errors.password} />
        {serverError && <p className="error" role="alert">{serverError}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
    </main>
  );
}

function OrgBar({ orgs, activeOrgId, onSelect, onCreated, onError }: {
  orgs: OrgRef[]; activeOrgId: string | null;
  onSelect: (id: string) => void; onCreated: () => void; onError: (m: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { onError('Organisation name is required.'); return; }
    setBusy(true); onError(null);
    try {
      const { data } = await api<OrgRef>('/api/v1/orgs', { method: 'POST', body: { name: name.trim() } });
      setName(''); onSelect(data.id); onCreated();
    } catch (err) { onError((err as ApiError).message); } finally { setBusy(false); }
  }
  return (
    <section aria-label="Organisations" className="card">
      <label htmlFor="org-select">Active organisation</label>
      <select id="org-select" value={activeOrgId ?? ''} onChange={(e) => onSelect(e.target.value)}>
        <option value="" disabled>Select an organisation</option>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
      </select>
      <form onSubmit={(e) => void create(e)} className="inline-form">
        <label htmlFor="org-name">New organisation name</label>
        <input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" />
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create organisation'}</button>
      </form>
    </section>
  );
}

interface TodoFilters { status: string; overdue: boolean; tag: string; sort: string; order: string; page: number; includeArchived: boolean; includeDeleted: boolean }

export function TodoList({ orgId }: { orgId: string }) {
  const [todos, setTodos] = useState<TodoDto[]>([]);
  const [etags, setEtags] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [f, setF] = useState<TodoFilters>({ status: '', overdue: false, tag: '', sort: 'createdAt', order: 'desc', page: 1, includeArchived: false, includeDeleted: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await api<PageDto<TodoDto>>(`/api/v1/orgs/${orgId}/todos`, {
        query: {
          ...(f.status ? { status: f.status } : {}),
          ...(f.overdue ? { overdue: 'true' } : {}),
          ...(f.tag ? { tag: f.tag } : {}),
          sort: f.sort, order: f.order, page: f.page, pageSize: 10,
          ...(f.includeArchived ? { includeArchived: true } : {}),
          ...(f.includeDeleted ? { includeDeleted: true } : {}),
        },
      });
      setTodos(data.items); setTotal(data.total); setTotalPages(Math.max(1, data.totalPages));
      // refresh ETags per row so mutations use fresh versions
      const next: Record<string, string> = {};
      for (const t of data.items) {
        try {
          const one = await api<TodoDto>(`/api/v1/orgs/${orgId}/todos/${t.id}`);
          if (one.etag) next[t.id] = one.etag;
        } catch { /* keep previous */ }
      }
      setEtags((p) => ({ ...p, ...next }));
    } catch (err) { setError((err as ApiError).message); } finally { setLoading(false); }
  }, [orgId, f]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Optimistic status toggle with per-row request sequencing (bugfix maintenance/01):
   * each row keeps a monotonically increasing seq; only the latest response may
   * commit or roll back, so rapid toggles cannot leave stale UI state.
   */
  const seqRef = useRef<Record<string, number>>({});
  async function toggle(todo: TodoDto) {
    const seq = (seqRef.current[todo.id] ?? 0) + 1;
    seqRef.current[todo.id] = seq;
    const prev = todo;
    const next: TodoDto = { ...todo, status: todo.status === 'Open' ? 'Done' : 'Open' };
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? next : t)));
    setError(null);
    try {
      const etag = etags[todo.id];
      if (!etag) throw new ApiError(428, 'No version known for this todo — reloading.', {});
      const { data, etag: newEtag } = await api<TodoDto>(`/api/v1/orgs/${orgId}/todos/${todo.id}/status`, {
        method: 'PATCH', body: { status: next.status }, ifMatch: etag,
      });
      if (seqRef.current[todo.id] !== seq) return; // superseded by a newer toggle
      setTodos((ts) => ts.map((t) => (t.id === todo.id ? data : t)));
      if (newEtag) setEtags((p) => ({ ...p, [todo.id]: newEtag }));
    } catch (err) {
      if (seqRef.current[todo.id] !== seq) return;
      const ae = err as ApiError;
      // Reload first (load() clears transient errors), then report — so the
      // conflict message is never wiped by the refresh it triggers.
      if (ae.status === 412) await load();
      if (seqRef.current[todo.id] !== seq) return;
      setTodos((ts) => ts.map((t) => (t.id === todo.id ? prev : t))); // rollback
      setError(ae.status === 412
        ? `“${prev.title}” changed elsewhere — reloaded latest version. Try again.`
        : ae.message + (ae.correlationId ? ` (ref ${ae.correlationId})` : ''));
    }
  }

  async function remove(todo: TodoDto, permanent: boolean) {
    const etag = etags[todo.id];
    if (!etag) { setError('No version known — reloading.'); void load(); return; }
    try {
      if (permanent) await api(`/api/v1/orgs/${orgId}/todos/${todo.id}/permanent`, { method: 'DELETE', ifMatch: etag });
      else await api(`/api/v1/orgs/${orgId}/todos/${todo.id}`, { method: 'DELETE', ifMatch: etag });
      void load();
    } catch (err) { setError((err as ApiError).message); }
  }

  async function restore(todo: TodoDto) {
    const etag = etags[todo.id];
    if (!etag) { setError('No version known — reloading.'); void load(); return; }
    try {
      await api(`/api/v1/orgs/${orgId}/todos/${todo.id}/restore`, { method: 'POST', body: {}, ifMatch: etag });
      void load();
    } catch (err) { setError((err as ApiError).message); }
  }

  return (
    <section aria-label="Todos" className="card">
      <h2>Todos {total > 0 && <span aria-label={`${total} total`}>({total})</span>}</h2>
      <div className="filters" role="group" aria-label="Filters, sorting and pagination">
        <label>Status <select aria-label="Filter by status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
          <option value="">All</option><option value="Open">Open</option><option value="Done">Done</option>
        </select></label>
        <label>Tag <input aria-label="Filter by tag" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value, page: 1 })} placeholder="home" /></label>
        <label>Sort <select aria-label="Sort todos" value={f.sort + ':' + f.order} onChange={(e) => { const [s, o] = e.target.value.split(':'); setF({ ...f, sort: s, order: o, page: 1 }); }}>
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="dueDate:asc">Due date (soonest)</option>
          <option value="dueDate:desc">Due date (latest)</option>
          <option value="priority:desc">Priority (high first)</option>
          <option value="priority:asc">Priority (low first)</option>
        </select></label>
        <label><input type="checkbox" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked, page: 1 })} /> Overdue only</label>
        <label><input type="checkbox" checked={f.includeArchived} onChange={(e) => setF({ ...f, includeArchived: e.target.checked, page: 1 })} /> Show archived</label>
        <label><input type="checkbox" checked={f.includeDeleted} onChange={(e) => setF({ ...f, includeDeleted: e.target.checked, page: 1 })} /> Show deleted</label>
      </div>
      {loading && <p role="status">Loading todos…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && todos.length === 0 && <p>No todos match. Create one below.</p>}
      <ul className="todo-list">
        {todos.map((t) => (
          <li key={t.id} className={t.isDeleted ? 'deleted' : t.isArchived ? 'archived' : ''}>
            <div>
              <strong>{t.title}</strong> <span className="pill">{t.status}</span> <span className="pill">{t.priority}</span>
              {t.isArchived && <span className="pill">archived</span>}
              {t.isDeleted && <span className="pill">deleted</span>}
              {t.description && <p>{t.description}</p>}
              <p className="meta">tags: {t.tags.join(', ') || '—'} · due: {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'} · v{t.version}</p>
            </div>
            <div className="row-actions">
              <button type="button" aria-label={`${t.status === 'Open' ? 'Mark done' : 'Reopen'}: ${t.title}`} onClick={() => void toggle(t)}>
                {t.status === 'Open' ? 'Mark done' : 'Reopen'}
              </button>
              <button type="button" aria-label={`Edit ${t.title}`} onClick={() => setEditing(t)}>Edit</button>
              {t.isDeleted ? (
                <button type="button" aria-label={`Restore ${t.title}`} onClick={() => void restore(t)}>Restore</button>
              ) : (
                <button type="button" aria-label={`Delete ${t.title}`} onClick={() => void remove(t, false)}>Delete</button>
              )}
              <button type="button" aria-label={`Permanently delete ${t.title} (admin only)`} onClick={() => void remove(t, true)}>Hard delete</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="pager" role="navigation" aria-label="Pagination">
        <button type="button" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Previous</button>
        <span aria-live="polite">Page {f.page} of {totalPages}</span>
        <button type="button" disabled={f.page >= totalPages} onClick={() => setF({ ...f, page: f.page + 1 })}>Next</button>
      </div>
      <TodoForm orgId={orgId} editing={editing} onSaved={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} />
    </section>
  );
}

function TodoForm({ orgId, editing, onSaved, onCancel }: { orgId: string; editing: TodoDto | null; onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('Medium');
  const [status, setStatus] = useState<TodoStatus>('Open');
  const [tags, setTags] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [etag, setEtag] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title); setDescription(editing.description);
      setPriority(editing.priority); setStatus(editing.status);
      setTags(editing.tags.join(', ')); setDueDate(editing.dueDate ? editing.dueDate.slice(0, 10) : '');
      void api<TodoDto>(`/api/v1/orgs/${orgId}/todos/${editing.id}`).then((r) => setEtag(r.etag)).catch(() => setEtag(null));
    } else {
      setTitle(''); setDescription(''); setPriority('Medium'); setStatus('Open'); setTags(''); setDueDate(''); setEtag(null);
    }
    setErrors({}); setServerError(null);
  }, [editing, orgId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const v = validateTodo(title, description, tagList);
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setServerError(null);
    const body = {
      title: title.trim(), description,
      priority, status,
      tags: tagList,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };
    try {
      if (editing) {
        if (!etag) { setServerError('Version not loaded yet — please wait and retry.'); return; }
        await api(`/api/v1/orgs/${orgId}/todos/${editing.id}`, { method: 'PUT', body, ifMatch: etag });
      } else {
        await api(`/api/v1/orgs/${orgId}/todos`, { method: 'POST', body });
        setTitle(''); setDescription(''); setTags(''); setDueDate('');
      }
      onSaved();
    } catch (err) {
      const ae = err as ApiError;
      if (ae.status === 412) setServerError('Someone else changed this todo. Latest version reloaded — review and save again.');
      else if (ae.fields) { const flat: Record<string, string> = {}; for (const [k, arr] of Object.entries(ae.fields)) flat[k.replace(/\[.*/, '')] = arr.join(' '); setErrors(flat); }
      else setServerError(ae.message);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="card" aria-label={editing ? 'Edit todo' : 'Create todo'} noValidate>
      <h3>{editing ? 'Edit todo' : 'New todo'}</h3>
      <label htmlFor="todo-title">Title (required)</label>
      <input id="todo-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'todo-title-err' : undefined} />
      <FieldError id="todo-title-err" message={errors.title} />
      <label htmlFor="todo-desc">Description</label>
      <textarea id="todo-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      <FieldError id="todo-desc-err" message={errors.description} />
      <div className="grid2">
        <div>
          <label htmlFor="todo-priority">Priority</label>
          <select id="todo-priority" value={priority} onChange={(e) => setPriority(e.target.value as TodoPriority)}>
            <option>Low</option><option>Medium</option><option>High</option>
          </select>
        </div>
        <div>
          <label htmlFor="todo-status">Status</label>
          <select id="todo-status" value={status} onChange={(e) => setStatus(e.target.value as TodoStatus)}>
            <option>Open</option><option>Done</option>
          </select>
        </div>
      </div>
      <label htmlFor="todo-tags">Tags (comma-separated)</label>
      <input id="todo-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="home, urgent" />
      <FieldError id="todo-tags-err" message={errors.tags} />
      <label htmlFor="todo-due">Due date</label>
      <input id="todo-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      {serverError && <p className="error" role="alert">{serverError}</p>}
      <div className="row-actions">
        <button type="submit">{editing ? 'Save changes' : 'Create todo'}</button>
        {editing && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function MembersPanel({ orgId, role }: { orgId: string; role: string }) {
  const [members, setMembers] = useState<MembershipDto[]>([]);
  const [username, setUsername] = useState('');
  const [newRole, setNewRole] = useState('Member');
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role === 'OrgAdmin';

  const load = useCallback(async () => {
    try { setMembers((await api<MembershipDto[]>(`/api/v1/orgs/${orgId}/members`)).data); setError(null); }
    catch (err) { setError((err as ApiError).message); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    try { await api(`/api/v1/orgs/${orgId}/members`, { method: 'POST', body: { username: username.trim(), role: newRole } }); setUsername(''); void load(); }
    catch (err) { setError((err as ApiError).message); }
  }
  async function changeRole(m: MembershipDto, r: string) {
    try { await api(`/api/v1/orgs/${orgId}/members/${m.userId}`, { method: 'PATCH', body: { role: r } }); void load(); }
    catch (err) { setError((err as ApiError).message); }
  }
  async function remove(m: MembershipDto) {
    try { await api(`/api/v1/orgs/${orgId}/members/${m.userId}`, { method: 'DELETE' }); void load(); }
    catch (err) { setError((err as ApiError).message); }
  }

  return (
    <section aria-label="Members" className="card">
      <h2>Members</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {!isAdmin && <p>Only OrgAdmins can manage members. You have the Member role.</p>}
      <ul>{members.map((m) => (
        <li key={m.userId}>{m.username} — {m.role}
          {isAdmin && (
            <span className="row-actions">
              <button type="button" aria-label={`Make ${m.username} ${m.role === 'OrgAdmin' ? 'Member' : 'OrgAdmin'}`} onClick={() => void changeRole(m, m.role === 'OrgAdmin' ? 'Member' : 'OrgAdmin')}>
                Make {m.role === 'OrgAdmin' ? 'Member' : 'OrgAdmin'}
              </button>
              <button type="button" aria-label={`Remove ${m.username}`} onClick={() => void remove(m)}>Remove</button>
            </span>
          )}
        </li>
      ))}</ul>
      {isAdmin && (
        <form onSubmit={(e) => void add(e)} className="inline-form">
          <label htmlFor="member-username">Username to add</label>
          <input id="member-username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <label htmlFor="member-role">Role</label>
          <select id="member-role" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option>Member</option><option>OrgAdmin</option>
          </select>
          <button type="submit">Add member</button>
        </form>
      )}
    </section>
  );
}

function AuditPanel({ orgId, role }: { orgId: string; role: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api<PageDto<AuditEntry>>(`/api/v1/orgs/${orgId}/audit`, { query: { pageSize: 50 } })
      .then((r) => setEntries(r.data.items))
      .catch((err) => setError((err as ApiError).message));
  }, [orgId]);
  if (role !== 'OrgAdmin') return <section className="card"><p role="alert">Only OrgAdmins can view the audit log.</p>{error && <p className="error">{error}</p>}</section>;
  return (
    <section aria-label="Audit log" className="card">
      <h2>Audit log</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <table>
        <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Entity</th><th scope="col">Actor</th><th scope="col">Correlation</th></tr></thead>
        <tbody>{entries.map((a) => (
          <tr key={a.id}><td>{new Date(a.timestamp).toLocaleString()}</td><td>{a.action}</td><td>{a.entityType}/{a.entityId.slice(0, 8)}</td><td>{a.actorUserId?.slice(0, 8) ?? '—'}</td><td><code>{a.correlationId.slice(0, 8)}</code></td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}

function ImportExportPanel({ orgId }: { orgId: string }) {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');

  async function doExport() {
    setError(null);
    try {
      const { data } = await api<{ items: unknown[] }>(`/api/v1/orgs/${orgId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `taskhub-export-${orgId}.json`; a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) { setError((err as ApiError).message); }
  }
  async function doImport(e: FormEvent) {
    e.preventDefault(); setError(null); setReport(null);
    try {
      const parsed = JSON.parse(text) as { items?: unknown[] };
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      const { data } = await api<ImportReport>(`/api/v1/orgs/${orgId}/import`, {
        method: 'POST', body: { items, idempotencyKey: crypto.randomUUID() },
      });
      setReport(data);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Invalid JSON — paste the exported file contents.'); }
  }
  return (
    <section aria-label="Import and export" className="card">
      <h2>Import / Export</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" onClick={() => void doExport()}>Export todos as JSON</button>
      <form onSubmit={(e) => void doImport(e)}>
        <label htmlFor="import-text">Paste export JSON to import</label>
        <textarea id="import-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Import</button>
      </form>
      {report && (
        <div role="status" aria-label="Import report">
          <p>Accepted: {report.accepted} · Rejected: {report.rejected}{report.duplicateRequest ? ' · duplicate request suppressed' : ''}</p>
          {report.rejectedRows.length > 0 && (
            <ul>{report.rejectedRows.map((r) => <li key={r.index}>Row {r.index}: {r.reasons.join('; ')}</li>)}</ul>
          )}
        </div>
      )}
    </section>
  );
}
