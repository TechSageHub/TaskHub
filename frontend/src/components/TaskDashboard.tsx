import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { PageDto, TodoDto } from '../api/types';
import TaskModal from './TaskModal';
import { Alert, Badge, Button, EmptyState, Modal, PageHeader, Pagination, PriorityBadge, SkeletonRows, StatCard, StatusBadge } from './ui';

interface TodoFilters {
  status: string; overdue: boolean; tag: string; sort: string; order: string;
  page: number; includeArchived: boolean; includeDeleted: boolean;
}

const DEFAULT_FILTERS: TodoFilters = {
  status: '', overdue: false, tag: '', sort: 'createdAt', order: 'desc',
  page: 1, includeArchived: false, includeDeleted: false,
};

interface Stats { total: number; open: number; done: number; overdue: number }

function formatDue(due: string | null): string {
  if (!due) return '—';
  return new Date(due).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isOverdue(t: TodoDto): boolean {
  return t.status === 'Open' && t.dueDate !== null && new Date(t.dueDate).getTime() < Date.now();
}

/** Task dashboard. Same API + concurrency behaviour as before; new SaaS layout. */
export function TodoList({ orgId }: { orgId: string }) {
  const [todos, setTodos] = useState<TodoDto[]>([]);
  const [etags, setEtags] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<Stats>({ total: 0, open: 0, done: 0, overdue: 0 });
  const [f, setF] = useState<TodoFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; editing: TodoDto | null }>({ open: false, editing: null });
  const [confirmHardDelete, setConfirmHardDelete] = useState<TodoDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtersActive = f.status !== '' || f.overdue || f.tag !== '' || f.includeArchived || f.includeDeleted;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = { sort: f.sort, order: f.order };
      const scoped = {
        ...(f.status ? { status: f.status } : {}),
        ...(f.overdue ? { overdue: 'true' } : {}),
        ...(f.tag ? { tag: f.tag } : {}),
        ...(f.includeArchived ? { includeArchived: true } : {}),
        ...(f.includeDeleted ? { includeDeleted: true } : {}),
      };
      const [page, openRes, doneRes, overdueRes] = await Promise.all([
        api<PageDto<TodoDto>>(`/api/v1/orgs/${orgId}/todos`, { query: { ...scoped, ...base, page: f.page, pageSize: 10 } }),
        api<PageDto<TodoDto>>(`/api/v1/orgs/${orgId}/todos`, { query: { status: 'Open', page: 1, pageSize: 1 } }),
        api<PageDto<TodoDto>>(`/api/v1/orgs/${orgId}/todos`, { query: { status: 'Done', page: 1, pageSize: 1 } }),
        api<PageDto<TodoDto>>(`/api/v1/orgs/${orgId}/todos`, { query: { overdue: 'true', page: 1, pageSize: 1 } }),
      ]);
      setTodos(page.data.items); setTotal(page.data.total); setTotalPages(Math.max(1, page.data.totalPages));
      setStats({ total: page.data.total, open: openRes.data.total, done: doneRes.data.total, overdue: overdueRes.data.total });
      // refresh ETags per row so mutations use fresh versions
      const next: Record<string, string> = {};
      for (const t of page.data.items) {
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
    setBusyId(todo.id);
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
    } finally {
      if (seqRef.current[todo.id] === seq) setBusyId(null);
    }
  }

  async function remove(todo: TodoDto, permanent: boolean) {
    const etag = etags[todo.id];
    if (!etag) { setError('No version known — reloading.'); void load(); return; }
    setBusyId(todo.id);
    try {
      if (permanent) await api(`/api/v1/orgs/${orgId}/todos/${todo.id}/permanent`, { method: 'DELETE', ifMatch: etag });
      else await api(`/api/v1/orgs/${orgId}/todos/${todo.id}`, { method: 'DELETE', ifMatch: etag });
      setConfirmHardDelete(null);
      void load();
    } catch (err) { setError((err as ApiError).message); }
    finally { setBusyId(null); }
  }

  async function restore(todo: TodoDto) {
    const etag = etags[todo.id];
    if (!etag) { setError('No version known — reloading.'); void load(); return; }
    setBusyId(todo.id);
    try {
      await api(`/api/v1/orgs/${orgId}/todos/${todo.id}/restore`, { method: 'POST', body: {}, ifMatch: etag });
      void load();
    } catch (err) { setError((err as ApiError).message); }
    finally { setBusyId(null); }
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Track, prioritise, and complete work for this organisation."
        actions={<Button variant="primary" onClick={() => setModal({ open: true, editing: null })}>New task</Button>}
      />

      <div className="stat-grid" aria-label="Task statistics">
        <StatCard label="Total tasks" value={stats.total} />
        <StatCard label="Open" value={stats.open} />
        <StatCard label="Overdue" value={stats.overdue} />
        <StatCard label="Done" value={stats.done} />
      </div>

      <div className="toolbar" role="group" aria-label="Filters, sorting and pagination">
        <div className="field">
          <label htmlFor="flt-status">Status</label>
          <select id="flt-status" aria-label="Filter by status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
            <option value="">All</option><option value="Open">Open</option><option value="Done">Done</option>
          </select>
        </div>
        <div className="field field-grow">
          <label htmlFor="flt-tag">Tag</label>
          <input id="flt-tag" aria-label="Filter by tag" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value, page: 1 })} placeholder="e.g. home" />
        </div>
        <div className="field">
          <label htmlFor="flt-sort">Sort</label>
          <select id="flt-sort" aria-label="Sort todos" value={f.sort + ':' + f.order} onChange={(e) => { const [s, o] = e.target.value.split(':'); setF({ ...f, sort: s, order: o, page: 1 }); }}>
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="dueDate:asc">Due date (soonest)</option>
            <option value="dueDate:desc">Due date (latest)</option>
            <option value="priority:desc">Priority (high first)</option>
            <option value="priority:asc">Priority (low first)</option>
          </select>
        </div>
        <div className="check-row">
          <label className="check"><input type="checkbox" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked, page: 1 })} /> Overdue only</label>
          <label className="check"><input type="checkbox" checked={f.includeArchived} onChange={(e) => setF({ ...f, includeArchived: e.target.checked, page: 1 })} /> Show archived</label>
          <label className="check"><input type="checkbox" checked={f.includeDeleted} onChange={(e) => setF({ ...f, includeDeleted: e.target.checked, page: 1 })} /> Show deleted</label>
        </div>
        {filtersActive && <Button variant="ghost" size="sm" onClick={() => setF({ ...DEFAULT_FILTERS, sort: f.sort, order: f.order })}>Reset filters</Button>}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <section aria-label="Todos">
        <h3 className="sr-only">Todos, {total} total</h3>
        {loading ? (
          <SkeletonRows label="Loading todos…" />
        ) : todos.length === 0 ? (
          <div className="card">
            <EmptyState
              title="No tasks found."
              hint="No todos match. Create one below."
            />
          </div>
        ) : (
          <>
            <ul className="todo-list">
              {todos.map((t) => {
                const done = t.status === 'Done';
                const pending = busyId === t.id;
                return (
                  <li key={t.id}>
                    <div className={`task-row${done ? ' is-done' : ''}${t.isDeleted ? ' is-deleted' : ''}`}>
                      <div className="task-main">
                        <div className="badge-row">
                          <StatusBadge status={t.status} />
                          <PriorityBadge priority={t.priority} />
                          {t.isArchived && <Badge tone="slate">archived</Badge>}
                          {t.isDeleted && <Badge tone="slate">deleted</Badge>}
                          {isOverdue(t) && <Badge tone="red">overdue</Badge>}
                          {/* legacy pill hooks for tests */}
                          <span className="sr-only pill">{t.status}</span>
                          <span className="sr-only pill">{t.priority}</span>
                        </div>
                        <div className="task-title">{t.title}</div>
                        {t.description && <p className="task-desc">{t.description}</p>}
                        <p className="task-meta">
                          {t.tags.length > 0 && <span>tags: {t.tags.join(', ')}</span>}
                          <span>due: {formatDue(t.dueDate)}</span>
                        </p>
                      </div>
                      <div className="task-actions">
                        <Button
                          size="sm"
                          aria-label={`${t.status === 'Open' ? 'Mark done' : 'Reopen'}: ${t.title}`}
                          onClick={() => void toggle(t)}
                          disabled={pending}
                        >
                          {pending ? 'Saving…' : t.status === 'Open' ? 'Mark done' : 'Reopen'}
                        </Button>
                        <Button size="sm" variant="ghost" aria-label={`Edit ${t.title}`} onClick={() => setModal({ open: true, editing: t })}>Edit</Button>
                        {t.isDeleted ? (
                          <Button size="sm" variant="ghost" aria-label={`Restore ${t.title}`} onClick={() => void restore(t)} disabled={pending}>Restore</Button>
                        ) : (
                          <Button size="sm" variant="ghost" aria-label={`Delete ${t.title}`} onClick={() => void remove(t, false)} disabled={pending}>Delete</Button>
                        )}
                        <Button size="sm" variant="ghost" aria-label={`Permanently delete ${t.title} (admin only)`} onClick={() => setConfirmHardDelete(t)}>Hard delete</Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination page={f.page} totalPages={totalPages} onPrev={() => setF({ ...f, page: f.page - 1 })} onNext={() => setF({ ...f, page: f.page + 1 })} />
          </>
        )}
      </section>

      {modal.open && (
        <TaskModal
          orgId={orgId}
          editing={modal.editing}
          onClose={() => setModal({ open: false, editing: null })}
          onSaved={() => { setModal({ open: false, editing: null }); void load(); }}
        />
      )}

      {confirmHardDelete && (
        <Modal size="sm" title="Permanently delete task?" sub="This cannot be undone. Only OrgAdmins can hard-delete." onClose={() => setConfirmHardDelete(null)}>
          <p style={{ margin: '0 0 1rem' }}>Delete <strong>{confirmHardDelete.title}</strong> permanently?</p>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setConfirmHardDelete(null)}>Cancel</Button>
            <Button variant="danger" aria-label={`Confirm hard delete ${confirmHardDelete.title}`} onClick={() => void remove(confirmHardDelete, true)}>
              Delete permanently
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
