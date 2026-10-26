'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

/**
 * Revisions — a section of Administrator → Configuration.
 *
 * How new subassembly revisions are labelled: letters (A, B … Z, AA) or
 * numbers (00, 01 …). A change applies to revisions made from then on;
 * existing ones keep their labels.
 */

const SCHEMES = [
  { value: 'LETTERS', label: 'Letters', example: 'A, B, C … Z, AA' },
  { value: 'NUMBERS', label: 'Numbers', example: '00, 01, 02 …' },
];

/** @param {{ has: (code: string) => boolean }} props */
export default function RevisionsConfig({ has }) {
  const canView = has('MATERIAL_CONFIG_VIEW');
  const canEdit = has('MATERIAL_CONFIG_EDIT');
  const [saved, setSaved] = useState(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    apiGet('/subassemblies/revision-scheme')
      .then((r) => { if (!cancelled) { setSaved(r.data.scheme); setValue(r.data.scheme); } })
      .catch((e) => { if (!cancelled) { setSaved(''); setError(e.message); } });
    return () => { cancelled = true; };
  }, [canView]);

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await apiPut('/subassemblies/revision-scheme', { scheme: value });
      setSaved(r.data.scheme);
      setNotice(`Saved — new revisions are labelled ${r.data.examples.join(', ')} …`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view this setting.</p>
      </div>
    );
  }
  if (saved === null) return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={2} rows={2} /></div>;

  return (
    <div className="bg-white rounded border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">Revisions</span>
        <span className="ml-2 text-xs text-gray-400">How subassembly revisions are labelled</span>
      </div>
      <div className="px-4 py-4 space-y-3">
        {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
        {notice && <p className="px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}
        <fieldset disabled={!canEdit} className="space-y-2">
          {SCHEMES.map((s) => (
            <label key={s.value} className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer">
              <input type="radio" name="rev-scheme" value={s.value} checked={value === s.value} onChange={() => { setValue(s.value); setNotice(''); }} />
              <span className="w-20 font-medium">{s.label}</span>
              <span className="font-mono text-gray-500">{s.example}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-gray-500">A change applies to revisions made from now on; existing revisions keep their labels.</p>
        {canEdit && (
          <button type="button" onClick={save} disabled={busy || value === saved} className="btn-primary px-4 py-1.5 disabled:opacity-40">
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}
