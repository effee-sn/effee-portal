'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiDelete, apiPostForm } from '@/lib/api';
import { API_URL } from '@/lib/config';

const formatBytes = (n) => {
  if (!n) return '0 B';
  const k = 1024, units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / k ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatDateTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ── Destructive restore confirm (type-to-confirm) ─────────────────────────────
function RestoreModal({ label, onClose, onConfirm }) {
  const [text, setText]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const armed = text.trim().toUpperCase() === 'RESTORE';

  const go = async () => {
    setBusy(true); setError('');
    try { await onConfirm(); onClose(); }
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-red-700 mb-2">Restore database</h2>
        <p className="text-sm text-gray-600 mb-3">
          This will <span className="font-semibold text-red-600">overwrite the entire live database</span> with
          <span className="font-medium text-gray-800"> {label}</span>. All current data is replaced and this
          cannot be undone. Do this during a maintenance window.
        </p>
        <p className="text-xs text-gray-500 mb-1">Type <span className="font-mono font-semibold">RESTORE</span> to confirm:</p>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="RESTORE"
          className="ams-input w-full mb-3" autoFocus />
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2 cursor-pointer">Cancel</button>
          <button onClick={go} disabled={!armed || busy} className="btn-danger flex-1 justify-center py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BackupPage() {
  useAuth();
  const { me, loading: permLoading } = usePermissions();
  const [backups, setBackups] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [busy, setBusy]        = useState('');   // 'create' | 'upload' | ''
  const [error, setError]      = useState('');
  const [msg, setMsg]          = useState('');
  const [modal, setModal]      = useState(null);  // { type:'restore', filename } | { type:'restore-upload', file }
  const fileRef = useRef(null);

  const canView = !!me?.is_system;

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await apiGet('/backups'); setBackups(r.data || []); }
    catch { setBackups([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!permLoading && canView) load();
    else if (!permLoading) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading]);

  const flash = (m) => { setMsg(m); setError(''); setTimeout(() => setMsg(''), 4000); };

  const create = async () => {
    setBusy('create'); setError(''); setMsg('');
    try { await apiPost('/backups'); await load(); flash('Backup created.'); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };

  const download = async (filename) => {
    setError('');
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${API_URL}/backups/${encodeURIComponent(filename)}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  const remove = async (filename) => {
    if (!window.confirm(`Delete backup ${filename}?`)) return;
    setError('');
    try { await apiDelete(`/backups/${encodeURIComponent(filename)}`); await load(); }
    catch (e) { setError(e.message); }
  };

  const restore = async (filename) => {
    await apiPost('/backups/restore', { filename });
    flash('Database restored.');
  };

  const restoreUpload = async (file) => {
    const fd = new FormData();
    fd.append('backup', file);
    await apiPostForm('/backups/restore-upload', fd);
    flash('Database restored from uploaded file.');
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setModal({ type: 'restore-upload', file });
  };

  if (permLoading || loading) {
    return <div className="bg-white rounded border border-gray-200 h-40 animate-pulse" />;
  }
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">Backup &amp; restore is restricted to system administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 flex-wrap">
          <span className="text-sm font-medium text-gray-700">Database Backups</span>
          <div className="flex-1" />
          <button onClick={() => fileRef.current?.click()} className="btn-secondary text-sm py-1.5 cursor-pointer">Restore from file…</button>
          <input ref={fileRef} type="file" accept=".sql" onChange={onPickFile} className="hidden" />
          <button onClick={create} disabled={busy === 'create'}
            className="cursor-pointer px-3 py-1.5 text-sm font-medium text-white rounded-sm disabled:opacity-50"
            style={{ backgroundColor: 'var(--ams-primary)' }}>
            {busy === 'create' ? 'Backing up…' : 'Create backup'}
          </button>
        </div>

        <div className="px-4 py-3">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
          {msg && <div className="px-3 py-2.5 rounded bg-green-50 border border-green-200 text-green-700 text-sm mb-3">{msg}</div>}

          {backups.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">No backups yet. Create one to get started.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-2 py-2 font-normal">Backup</th>
                  <th className="px-2 py-2 font-normal">Size</th>
                  <th className="px-2 py-2 font-normal">Created</th>
                  <th className="px-2 py-2 w-40" />
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename} className="border-b border-gray-100">
                    <td className="px-2 py-2 font-medium text-gray-800 font-mono text-xs">{b.filename}</td>
                    <td className="px-2 py-2 text-gray-600">{formatBytes(b.size)}</td>
                    <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDateTime(b.created_at)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button onClick={() => download(b.filename)} className="cursor-pointer text-xs text-gray-500 hover:text-gray-800 px-2">Download</button>
                      <button onClick={() => setModal({ type: 'restore', filename: b.filename })} className="cursor-pointer text-xs text-amber-600 hover:text-amber-800 px-2">Restore</button>
                      <button onClick={() => remove(b.filename)} className="cursor-pointer text-xs text-red-500 hover:text-red-700 px-2">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 px-1">
        A backup is a full snapshot (schema + data). Restoring overwrites the entire live database — restore a
        backup that matches the currently deployed version, and prefer a maintenance window.
      </p>

      {modal?.type === 'restore' && (
        <RestoreModal label={modal.filename} onClose={() => setModal(null)}
          onConfirm={() => restore(modal.filename)} />
      )}
      {modal?.type === 'restore-upload' && (
        <RestoreModal label={`uploaded file "${modal.file.name}"`} onClose={() => setModal(null)}
          onConfirm={() => restoreUpload(modal.file)} />
      )}
    </div>
  );
}
