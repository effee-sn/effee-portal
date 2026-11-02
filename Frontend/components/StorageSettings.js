'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { SkeletonLine } from '@/components/Skeleton';

/**
 * Administrator → Settings → Storage: where uploaded files are kept — this
 * server's disk or Azure Blob Storage.
 *
 * The storage account and key live in the backend .env (AZURE_STORAGE_*);
 * this card shows whether they're present and holds the switch. Turning Blob
 * on asks whether to copy the existing files there (off: whether to copy them
 * back). Copying runs in the background; its progress is shown here. Files are
 * never deleted by a switch or a copy, and a file not yet copied still opens.
 */

const Row = ({ k, v, mono }) => (
  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
    <span className="text-gray-500">{k}</span>
    <span className={`text-gray-800 break-all ${mono ? 'font-mono text-xs pt-0.5' : ''}`}>{v || <span className="text-gray-400">—</span>}</span>
  </div>
);

const mb = (bytes) => (bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`);
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const WAY = { TO_BLOB: 'This server → Azure Blob', TO_LOCAL: 'Azure Blob → this server' };

export default function StorageSettings() {
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null); // 'BLOB' | 'LOCAL' — the switch being confirmed

  const load = useCallback(async () => {
    try { setStatus((await apiGet('/settings/storage', { silent: true })).data); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Follow a running transfer.
  const running = status?.transfer?.status === 'RUNNING';
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [running, load]);

  /** @param {'BLOB'|'LOCAL'} driver @param {boolean} transfer */
  const change = async (driver, transfer) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      const res = await apiPut('/settings/storage', { driver, transfer });
      setStatus(res.data); setAsk(null);
      setMsg({ type: 'success', text: driver === 'BLOB'
        ? `New files now go to Azure Blob Storage.${transfer ? ' Copying the existing files there — progress below.' : ''}`
        : `New files now stay on this server.${transfer ? ' Copying the files from Azure Blob back — progress below.' : ''}` });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  };

  const rerun = async (direction) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try { setStatus((await apiPost('/settings/storage/transfer', { direction })).data); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(false); }
  };

  const onBlob = status?.driver === 'BLOB';
  const t = status?.transfer;
  const pct = t?.total ? Math.round(((t.copied + t.skipped + t.failed) / t.total) * 100) : 0;

  return (
    <section className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">File storage</h2>
          <p className="text-xs text-gray-500 mt-0.5">Where uploaded documents and the company logo are kept: this server, or Azure Blob Storage.</p>
        </div>
        {status && (
          <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${status.active === 'BLOB'
            ? 'bg-green-50 text-green-700' : status.configured ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-800'}`}>
            {status.active === 'BLOB' ? 'Azure Blob' : status.configured ? 'This server' : 'This server · Blob not configured'}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {msg.text && (
          <p className={`px-3 py-2 rounded text-sm border ${msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
            {msg.text}
          </p>
        )}

        {!status ? (
          <div className="space-y-3"><SkeletonLine className="h-4 w-2/3" /><SkeletonLine className="h-4 w-1/2" /><SkeletonLine className="h-4 w-3/5" /></div>
        ) : (
          <>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Azure Blob connection (backend .env)</h3>
              {!status.configured && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
                  Missing: <span className="font-mono text-xs">{status.missing.join(', ')}</span>. Add it to the backend <span className="font-mono text-xs">.env</span> and restart it — see the setup steps below.
                </p>
              )}
              <div className="divide-y divide-gray-100">
                <Row k="Storage account" v={status.account} mono />
                <Row k="Container" v={status.configured ? `${status.container} (private)` : null} mono />
                <Row k="On this server" v={`${status.local.files} file${status.local.files === 1 ? '' : 's'} · ${mb(status.local.bytes)}`} />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <label className={`flex items-start gap-3 ${!status.configured || busy || running ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" className="mt-1" checked={onBlob} disabled={!status.configured || busy || running}
                  onChange={(e) => setAsk(e.target.checked ? 'BLOB' : 'LOCAL')} />
                <span>
                  <span className="block text-sm font-medium text-gray-800">Store files on Azure Blob Storage</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    On: new uploads go to Blob. Off: they stay on this server. Files are never deleted by switching, and one that
                    wasn&apos;t copied still opens from where it is.
                  </span>
                </span>
              </label>

              {ask && (
                <div className="mt-3 ml-7 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-3" role="alertdialog" aria-label="Copy the existing files?">
                  {ask === 'BLOB' ? (
                    <p>
                      Copy the <b>{status.local.files}</b> existing file{status.local.files === 1 ? '' : 's'} (<b>{mb(status.local.bytes)}</b>) from this server to Azure Blob Storage?
                      The copies on this server are kept until you remove them.
                    </p>
                  ) : (
                    <p>Copy the files on Azure Blob Storage back to this server? Files already here are skipped; nothing is deleted from Blob.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => change(ask, true)} disabled={busy} className="btn-primary px-3 py-1.5">
                      {busy ? 'Switching…' : ask === 'BLOB' ? 'Yes — copy the files and switch' : 'Yes — copy them back and switch'}
                    </button>
                    <button type="button" onClick={() => change(ask, false)} disabled={busy} className="btn-secondary px-3 py-1.5">Switch without copying</button>
                    <button type="button" onClick={() => setAsk(null)} disabled={busy} className="btn-secondary px-3 py-1.5">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {t && (
              <div className="pt-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Last copy · {WAY[t.direction]}</h3>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${{
                    RUNNING: 'bg-blue-50 text-blue-700', DONE: 'bg-green-50 text-green-700',
                    FAILED: 'bg-red-50 text-red-700', INTERRUPTED: 'bg-amber-50 text-amber-800',
                  }[t.status]}`}>{{ RUNNING: 'Copying…', DONE: 'Done', FAILED: 'Finished with errors', INTERRUPTED: 'Interrupted' }[t.status]}</span>
                </div>
                <div className="h-2 rounded bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full ${t.failed ? 'bg-amber-500' : 'bg-green-600'} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-sm text-gray-700">
                  {t.copied + t.skipped + t.failed} of {t.total} · <b>{t.copied}</b> copied ({mb(t.bytes)}) · {t.skipped} already there
                  {t.failed > 0 && <> · <span className="text-red-600"><b>{t.failed}</b> failed</span></>}
                </p>
                <p className="text-xs text-gray-500">
                  Started {when(t.started_at)}{t.by ? ` by ${t.by}` : ''}{t.finished_at ? ` · finished ${when(t.finished_at)}` : ''}
                </p>
                {t.error && <p className="text-sm text-red-600">{t.error}</p>}
                {t.failures?.length > 0 && (
                  <details className="text-xs text-gray-600">
                    <summary className="cursor-pointer">Files that failed</summary>
                    <ul className="mt-1 space-y-0.5 font-mono">{t.failures.map((f) => <li key={f.key}>{f.key} — {f.error}</li>)}</ul>
                  </details>
                )}
                {(t.status === 'FAILED' || t.status === 'INTERRUPTED') && (
                  <button type="button" onClick={() => rerun(t.direction)} disabled={busy} className="btn-secondary px-3 py-1.5">
                    Copy again (skips files already copied)
                  </button>
                )}
              </div>
            )}

            <details className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700">
              <summary className="cursor-pointer font-medium text-gray-800">Setup steps for Azure Blob Storage</summary>
              <ol className="list-decimal pl-5 mt-3 space-y-2">
                <li>Azure portal → <b>Storage accounts</b> → <b>Create</b> (StorageV2, same region as the portal). Leave <b>anonymous blob access</b> off.</li>
                <li>In the account → <b>Security + networking</b> → <b>Access keys</b> → copy a <b>Connection string</b>.</li>
                <li>
                  Put it in the backend <span className="font-mono text-xs">.env</span>:{' '}
                  <span className="font-mono text-xs break-all">AZURE_STORAGE_CONNECTION_STRING=…</span> (or{' '}
                  <span className="font-mono text-xs">AZURE_STORAGE_ACCOUNT_NAME</span> + <span className="font-mono text-xs">AZURE_STORAGE_ACCOUNT_KEY</span>), and optionally{' '}
                  <span className="font-mono text-xs">AZURE_STORAGE_CONTAINER</span> (default effee-portal — created automatically, private).
                </li>
                <li>Restart the backend, then switch Blob on here and choose to copy the existing files.</li>
                <li>Recommended in Azure: turn on <b>soft delete</b> and <b>versioning</b> for blobs, so a deleted or overwritten file can be recovered.</li>
              </ol>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
