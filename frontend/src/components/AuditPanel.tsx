import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AuditEntry, PageDto } from '../api/types';
import { Alert, Button, EmptyState, PageHeader, SkeletonRows } from './ui';

const ENTITY_TYPES = ['', 'Todo', 'Membership', 'Organisation', 'User', 'Import'];

/** Audit log screen. Same OrgAdmin-gated API; table + entity filter + pager. */
export default function AuditPanel({ orgId, role }: { orgId: string; role: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api<PageDto<AuditEntry>>(`/api/v1/orgs/${orgId}/audit`, {
        query: { pageSize: 20, page, ...(entityType ? { entityType } : {}) },
      });
      setEntries(data.items); setTotalPages(Math.max(1, data.totalPages)); setError(null);
    } catch (err) { setError((err as ApiError).message); }
    finally { setLoading(false); }
  }, [orgId, entityType, page]);
  useEffect(() => { void load(); }, [load]);

  if (role !== 'OrgAdmin') return (
    <div>
      <PageHeader title="Audit log" />
      <Alert kind="error">Only OrgAdmins can view the audit log.</Alert>
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );

  return (
    <div>
      <PageHeader title="Audit log" description="Every important event in this organisation, newest first." />
      {error && <Alert kind="error">{error} <Button variant="ghost" size="sm" onClick={() => void load()}>Retry</Button></Alert>}
      <div className="toolbar" role="group" aria-label="Audit filters">
        <div className="field">
          <label htmlFor="audit-entity">Entity type</label>
          <select id="audit-entity" aria-label="Filter audit by entity type" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {ENTITY_TYPES.slice(1).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {loading ? (
        <SkeletonRows label="Loading audit log…" />
      ) : entries.length === 0 ? (
        <div className="card"><EmptyState title="No audit entries." hint="Nothing has happened here yet — events will appear as the team works." /></div>
      ) : (
        <>
          <div className="table-wrap" role="region" aria-label="Audit entries" tabIndex={0}>
            <table className="data">
              <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Entity</th><th scope="col">Actor</th><th scope="col">Correlation</th></tr></thead>
              <tbody>{entries.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.timestamp).toLocaleString()}</td>
                  <td><strong>{a.action}</strong></td>
                  <td>{a.entityType}/{a.entityId.slice(0, 8)}</td>
                  <td>{a.actorUserId ? <span className="mono">{a.actorUserId.slice(0, 8)}</span> : 'system'}</td>
                  <td><code className="mono">{a.correlationId.slice(0, 8)}</code></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="pager" role="navigation" aria-label="Pagination">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span aria-live="polite">Page {page} of {totalPages}</span>
            <Button size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </>
      )}
    </div>
  );
}
