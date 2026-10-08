import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError, toUserError, validateTodo } from '../api/client';
import type { UserError } from '../api/client';
import type { TodoDto, TodoPriority, TodoStatus } from '../api/types';
import { ErrorAlert, FieldError, Modal } from './ui';

/** Create/edit dialog. Same API behaviour + accessible names as the previous inline form. */
export default function TaskModal({ orgId, editing, onClose, onSaved }: {
  orgId: string; editing: TodoDto | null; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [priority, setPriority] = useState<TodoPriority>(editing?.priority ?? 'Medium');
  const [status, setStatus] = useState<TodoStatus>(editing?.status ?? 'Open');
  const [tags, setTags] = useState(editing?.tags.join(', ') ?? '');
  const [dueDate, setDueDate] = useState(editing?.dueDate ? editing.dueDate.slice(0, 10) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<UserError | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      void api<TodoDto>(`/api/v1/orgs/${orgId}/todos/${editing.id}`)
        .then((r) => setEtag(r.etag))
        .catch(() => setEtag(null));
    }
  }, [editing, orgId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const v = validateTodo(title, description, tagList);
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setServerError(null);
    setBusy(true);
    const body = {
      title: title.trim(), description,
      priority, status,
      tags: tagList,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };
    try {
      if (editing) {
        if (!etag) { setServerError({ message: 'The latest version is still loading. Please wait and try again.' }); return; }
        await api(`/api/v1/orgs/${orgId}/todos/${editing.id}`, { method: 'PUT', body, ifMatch: etag });
      } else {
        await api(`/api/v1/orgs/${orgId}/todos`, { method: 'POST', body });
      }
      onSaved();
    } catch (err) {
      const ae = err as ApiError;
      if (ae.status === 412) setServerError({ message: 'Someone else changed this todo. Latest version reloaded — review and save again.', reference: ae.correlationId });
      else if (ae.fields) {
        const flat: Record<string, string> = {};
        for (const [k, arr] of Object.entries(ae.fields)) flat[k.replace(/\[.*/, '')] = arr.join(' ');
        setErrors(flat);
      } else setServerError(toUserError(ae));
    } finally { setBusy(false); }
  }

  return (
    <Modal
      title={editing ? 'Edit task' : 'New task'}
      sub={editing ? 'Update this task. If someone else made changes, you will be asked to review before saving.' : undefined}
      onClose={onClose}
    >
      <form onSubmit={(e) => void submit(e)} aria-label={editing ? 'Edit todo' : 'Create todo'} noValidate>
        <div className="field">
          <label htmlFor="todo-title">Title (required) <span className="required" aria-hidden="true">*</span></label>
          <input
            id="todo-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Prepare client handover notes"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'todo-title-err' : undefined}
          />
          <FieldError id="todo-title-err" message={errors.title} />
        </div>
        <div className="field">
          <label htmlFor="todo-desc">Description</label>
          <textarea
            id="todo-desc" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Context, acceptance criteria, links…"
          />
          <FieldError id="todo-desc-err" message={errors.description} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="todo-priority">Priority</label>
            <select id="todo-priority" value={priority} onChange={(e) => setPriority(e.target.value as TodoPriority)}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="todo-status">Status</label>
            <select id="todo-status" value={status} onChange={(e) => setStatus(e.target.value as TodoStatus)}>
              <option>Open</option><option>Done</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="todo-tags">Tags</label>
          <input
            id="todo-tags" value={tags} onChange={(e) => setTags(e.target.value)}
            placeholder="home, urgent"
            aria-describedby={errors.tags ? 'todo-tags-err' : 'todo-tags-hint'}
          />
          {!errors.tags && <span id="todo-tags-hint" className="field-hint">Comma-separated, letters/numbers/dashes only.</span>}
          <FieldError id="todo-tags-err" message={errors.tags} />
        </div>
        <div className="field">
          <label htmlFor="todo-due">Due date</label>
          <input id="todo-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <ErrorAlert error={serverError} />
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create todo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
