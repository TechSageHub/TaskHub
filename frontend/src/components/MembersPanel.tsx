import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { MembershipDto } from '../api/types';
import { Alert, Avatar, Badge, Button, EmptyState, Modal, PageHeader, SkeletonRows } from './ui';

/** Members management. Same API/RBAC behaviour; table layout + add-member dialog. */
export default function MembersPanel({ orgId, role }: { orgId: string; role: string }) {
  const [members, setMembers] = useState<MembershipDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const isAdmin = role === 'OrgAdmin';

  const load = useCallback(async () => {
    setLoading(true);
    try { setMembers((await api<MembershipDto[]>(`/api/v1/orgs/${orgId}/members`)).data); setError(null); }
    catch (err) { setError((err as ApiError).message); }
    finally { setLoading(false); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function changeRole(m: MembershipDto, r: string) {
    try { await api(`/api/v1/orgs/${orgId}/members/${m.userId}`, { method: 'PATCH', body: { role: r } }); void load(); }
    catch (err) { setError((err as ApiError).message); }
  }
  async function remove(m: MembershipDto) {
    try { await api(`/api/v1/orgs/${orgId}/members/${m.userId}`, { method: 'DELETE' }); void load(); }
    catch (err) { setError((err as ApiError).message); }
  }

  return (
    <div>
      <PageHeader
        title="Members"
        description={isAdmin ? 'Manage who belongs to this organisation and their roles.' : undefined}
        actions={isAdmin ? <Button variant="primary" onClick={() => setDialogOpen(true)}>Add member</Button> : undefined}
      />
      {error && <Alert kind="error">{error} <Button variant="ghost" size="sm" onClick={() => void load()}>Retry</Button></Alert>}
      {!isAdmin && <Alert kind="info">Only OrgAdmins can manage members. You have the Member role.</Alert>}
      {loading ? (
        <SkeletonRows label="Loading members…" />
      ) : members.length === 0 ? (
        <div className="card"><EmptyState title="No members yet." hint="This organisation has no members." /></div>
      ) : (
        <div className="table-wrap" role="region" aria-label="Members table" tabIndex={0}>
          <table className="data">
            <thead><tr><th scope="col">Member</th><th scope="col">Role</th>{isAdmin && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.userId}>
                <td><span style={{ display: 'inline-flex', gap: '0.6rem', alignItems: 'center' }}><Avatar name={m.username} />{m.username}</span></td>
                <td><Badge tone={m.role === 'OrgAdmin' ? 'blue' : 'slate'}>{m.role}</Badge></td>
                {isAdmin && (
                  <td className="actions-cell">
                    <Button size="sm" variant="secondary" aria-label={`Make ${m.username} ${m.role === 'OrgAdmin' ? 'Member' : 'OrgAdmin'}`} onClick={() => void changeRole(m, m.role === 'OrgAdmin' ? 'Member' : 'OrgAdmin')}>
                      Make {m.role === 'OrgAdmin' ? 'Member' : 'OrgAdmin'}
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${m.username}`} onClick={() => void remove(m)}>Remove</Button>
                  </td>
                )}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {dialogOpen && <AddMemberDialog orgId={orgId} onClose={() => setDialogOpen(false)} onAdded={() => { setDialogOpen(false); void load(); }} onError={setError} />}
    </div>
  );
}

function AddMemberDialog({ orgId, onClose, onAdded, onError }: {
  orgId: string; onClose: () => void; onAdded: () => void; onError: (m: string | null) => void;
}) {
  const [username, setUsername] = useState('');
  const [newRole, setNewRole] = useState('Member');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setLocalError('Enter the username of an existing TaskHub user.'); return; }
    setBusy(true); setLocalError(null); onError(null);
    try {
      await api(`/api/v1/orgs/${orgId}/members`, { method: 'POST', body: { username: username.trim(), role: newRole } });
      onAdded();
    } catch (err) {
      const msg = (err as ApiError).message;
      setLocalError(msg);
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Add member" sub="The user must already have a TaskHub account." onClose={onClose} size="sm">
      <form onSubmit={(e) => void add(e)} noValidate>
        <div className="field">
          <label htmlFor="member-username">Username to add</label>
          <input id="member-username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" placeholder="e.g. maria_99" />
        </div>
        <div className="field">
          <label htmlFor="member-role">Role</label>
          <select id="member-role" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option>Member</option><option>OrgAdmin</option>
          </select>
        </div>
        {localError && <p className="alert alert-error" role="alert">{localError}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add to organisation'}</button>
        </div>
      </form>
    </Modal>
  );
}
