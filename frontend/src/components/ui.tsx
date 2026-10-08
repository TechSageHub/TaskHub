import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { UserError } from '../api/client';

/* ---------- buttons ---------- */
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type BtnSize = 'md' | 'sm';

export function Button({ variant = 'secondary', size = 'md', className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  return <button type="button" className={`btn btn-${variant} btn-${size} ${className}`.trim()} {...rest} />;
}

/* ---------- badges ---------- */
type BadgeTone = 'blue' | 'green' | 'amber' | 'red' | 'slate';

export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={status === 'Done' ? 'green' : 'blue'}>{status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone: BadgeTone = priority === 'High' ? 'red' : priority === 'Medium' ? 'amber' : 'slate';
  return <Badge tone={tone}>{priority}</Badge>;
}

/* ---------- alerts ---------- */
export function Alert({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  if (kind === 'error') return <p className="alert alert-error" role="alert">{children}</p>;
  if (kind === 'success') return <p className="alert alert-success" role="status">{children}</p>;
  return <p className="alert alert-info" role="status">{children}</p>;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="field-error" role="alert">{message}</p>;
}

/* ---------- error presentation ---------- */
function ErrorReference({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — reference stays visible.
    }
  }
  return (
    <details className="error-details">
      <summary>Error details</summary>
      <p>Reference: <code className="mono">{value}</code></p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy error reference'}
      </button>
    </details>
  );
}

/**
 * Consistent user-facing error: human-readable message, optional retry, and an
 * opt-in "Error details" disclosure holding the support reference. Technical
 * details never appear in the primary message.
 */
export function ErrorAlert({ error, onRetry }: { error: UserError | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <p className="alert-message">{error.message}</p>
      {(onRetry || error.reference) && (
        <div className="alert-row">
          {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button>}
          {error.reference && <ErrorReference value={error.reference} />}
        </div>
      )}
    </div>
  );
}

/* ---------- loading / empty ---------- */
export function SkeletonRows({ count = 4, label = 'Loading…' }: { count?: number; label?: string }) {
  return (
    <div>
      <p className="sr-only" role="status">{label}</p>
      <div className="skeleton" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton-bar" />)}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{hint}</p>
      {action}
    </div>
  );
}

/* ---------- page header / stats / pagination ---------- */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-value" aria-label={`${value} ${label}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Pagination({ page, totalPages, onPrev, onNext }: {
  page: number; totalPages: number; onPrev: () => void; onNext: () => void;
}) {
  return (
    <div className="pager" role="navigation" aria-label="Pagination">
      <Button size="sm" disabled={page <= 1} onClick={onPrev}>Previous</Button>
      <span aria-live="polite">Page {page} of {totalPages}</span>
      <Button size="sm" disabled={page >= totalPages} onClick={onNext}>Next</Button>
    </div>
  );
}

/* ---------- avatar ---------- */
export function Avatar({ name }: { name: string }) {
  const initials = name.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 2).toUpperCase() || '?';
  return (
    <span aria-hidden="true" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 30, height: 30, borderRadius: 999, background: '#dbeafe', color: '#1e40af',
      fontWeight: 700, fontSize: '0.78rem', flex: 'none',
    }}>{initials}</span>
  );
}

/* ---------- modal dialog ---------- */
export function Modal({ title, sub, onClose, children, size = 'md' }: {
  title: string; sub?: string; onClose: () => void; children: ReactNode; size?: 'md' | 'sm';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Element | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-overlay">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal${size === 'sm' ? ' modal-sm' : ''}`}
      >
        <h2>{title}</h2>
        {sub && <p className="modal-sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}
