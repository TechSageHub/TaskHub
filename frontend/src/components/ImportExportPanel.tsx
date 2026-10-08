import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api, toUserError } from '../api/client';
import type { UserError } from '../api/client';
import type { ImportReport } from '../api/types';
import { Alert, Button, ErrorAlert, PageHeader } from './ui';

/** Import/export with file picker (no raw-JSON pasting required). Same API + idempotency. */
export default function ImportExportPanel({ orgId }: { orgId: string }) {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [exported, setExported] = useState(false);

  async function doExport() {
    setError(null); setExported(false); setBusy('export');
    try {
      const { data } = await api<{ items: unknown[] }>(`/api/v1/orgs/${orgId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `taskhub-export-${orgId}.json`; a.click();
      URL.revokeObjectURL(a.href);
      setExported(true);
    } catch (err) { setError(toUserError(err)); }
    finally { setBusy(null); }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileName(f?.name ?? null);
    setReport(null); setError(null);
    if (!f) { setFileText(null); return; }
    try { setFileText(await f.text()); }
    catch { setError({ message: 'Could not read that file. Choose a JSON export file.' }); setFileText(null); }
  }

  async function doImport(e: FormEvent) {
    e.preventDefault(); setError(null); setReport(null);
    if (!fileText) { setError({ message: 'Choose a JSON file to import first.' }); return; }
    setBusy('import');
    try {
      const parsed = JSON.parse(fileText) as { items?: unknown[] };
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items)) throw new Error('bad-shape');
      const { data } = await api<ImportReport>(`/api/v1/orgs/${orgId}/import`, {
        method: 'POST', body: { items, idempotencyKey: crypto.randomUUID() },
      });
      setReport(data);
    } catch (err) {
      if (err instanceof SyntaxError || (err instanceof Error && err.message === 'bad-shape')) {
        setError({ message: 'That file is not valid import JSON. Use a file previously exported from TaskHub.' });
      } else setError(toUserError(err));
    } finally { setBusy(null); }
  }

  return (
    <div>
      <PageHeader title="Import / Export" description="Move tasks in and out of this organisation for onboarding and handovers." />
      <ErrorAlert error={error} />
      <div className="io-grid">
        <section className="card" aria-label="Export">
          <h3>Export tasks</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Downloads every visible task in this organisation as JSON — title, description,
            status, priority, tags, and due dates — ready to re-import elsewhere.
          </p>
          <Button variant="primary" onClick={() => void doExport()} disabled={busy !== null}>
            {busy === 'export' ? 'Exporting…' : 'Export todos as JSON'}
          </Button>
          {exported && <Alert kind="success">Export downloaded.</Alert>}
        </section>
        <section className="card" aria-label="Import">
          <h3>Import tasks</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Choose a previously exported JSON file. Every row is validated; repeats are
            safely ignored thanks to idempotent imports.
          </p>
          <form onSubmit={(e) => void doImport(e)}>
            <div className="field">
              <label htmlFor="import-file">Choose JSON file to import</label>
              <input id="import-file" type="file" accept="application/json,.json" onChange={(e) => void onFile(e)} />
              {fileName && <span className="file-name" aria-live="polite">Selected: {fileName}</span>}
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy !== null || !fileText}>
              {busy === 'import' ? 'Importing…' : 'Import'}
            </button>
          </form>
          {busy === 'import' && <p role="status">Importing…</p>}
          {report && (
            <div className="report" role="status" aria-label="Import report">
              <p style={{ margin: 0, fontWeight: 650 }}>
                Accepted: {report.accepted} · Rejected: {report.rejected}
                {report.duplicateRequest ? ' · duplicate request suppressed' : ''}
              </p>
              {report.rejectedRows.length > 0 && (
                <ul>{report.rejectedRows.map((r) => <li key={r.index}>Row {r.index}: {r.reasons.join('; ')}</li>)}</ul>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
