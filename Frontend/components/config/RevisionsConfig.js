'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

/**
 * Revisions — a section of Administrator → Configuration.
 *
 * How drawing revisions — subassemblies and Finished parts — are labelled:
 * letters (A, B … Z, AA) or numbers (01, 02 …), and the first release: just
 * the drawing no. ("Original", then the first change is Rev A), or already
 * Rev A / 00. A change applies to revisions made from then on; existing ones
 * keep their labels.
 */

const SCHEMES = [
  { value: 'LETTERS', label: 'Letters' },
  { value: 'NUMBERS', label: 'Numbers' },
];
const FIRST = [
  { value: 'ORIGINAL', label: 'Drawing number only', hint: 'the first release is named below; the first change is Rev A / 01' },
  { value: 'REV', label: 'Starts at Rev A / 00', hint: 'the first release already carries a revision' },
];

/** The first three labels — mirrors the server's labelFor. */
function preview({ scheme, first_release: first, original_label: original }) {
  const letters = (n) => { let s = ''; let k = n; while (k > 0) { k -= 1; s = String.fromCharCode(65 + (k % 26)) + s; k = Math.floor(k / 26); } return s; };
  const at = (seq) => {
    if (first === 'REV') return scheme === 'NUMBERS' ? `Rev ${String(seq - 1).padStart(2, '0')}` : `Rev ${letters(seq)}`;
    if (seq === 1) return original || 'Original';
    return scheme === 'NUMBERS' ? `Rev ${String(seq - 1).padStart(2, '0')}` : `Rev ${letters(seq - 1)}`;
  };
  return [1, 2, 3].map(at);
}

/** @param {{ has: (code: string) => boolean }} props */
export default function RevisionsConfig({ has }) {
  const canView = has('MATERIAL_CONFIG_VIEW');
  const canEdit = has('MATERIAL_CONFIG_EDIT');
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState({ scheme: 'LETTERS', first_release: 'ORIGINAL', original_label: 'Original' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (d) => ({ scheme: d.scheme, first_release: d.first_release, original_label: d.original_label });

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    apiGet('/subassemblies/revision-scheme')
      .then((r) => { if (!cancelled) { setSaved(pick(r.data)); setForm(pick(r.data)); } })
      .catch((e) => { if (!cancelled) { setSaved({}); setError(e.message); } });
    return () => { cancelled = true; };
  }, [canView]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setNotice(''); setError(''); };
  const changed = saved && ['scheme', 'first_release', 'original_label'].some((k) => form[k] !== saved[k]);

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await apiPut('/subassemblies/revision-scheme', { ...form, original_label: form.original_label.trim() });
      setSaved(pick(r.data)); setForm(pick(r.data));
      setNotice(`Saved — new drawings go ${preview(r.data).join(' → ')} …`);
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
        <span className="ml-2 text-xs text-gray-400">How drawing revisions are labelled — subassemblies and Finished parts</span>
      </div>
      <div className="px-4 py-4 space-y-4">
        {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
        {notice && <p className="px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">First release</p>
            {FIRST.map((o) => (
              <label key={o.value} className="flex items-start gap-3 text-sm text-gray-800 cursor-pointer">
                <input type="radio" name="rev-first" className="mt-1" checked={form.first_release === o.value} onChange={() => set('first_release', o.value)} />
                <span><span className="font-medium">{o.label}</span> <span className="text-gray-500">— {o.hint}</span></span>
              </label>
            ))}
            {form.first_release === 'ORIGINAL' && (
              <div className="pl-7 flex items-center gap-2">
                <label htmlFor="rev-orig" className="text-sm text-gray-600">Its name</label>
                <input id="rev-orig" value={form.original_label} onChange={(e) => set('original_label', e.target.value)} maxLength={10}
                  className="ams-input w-40" placeholder="Original" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Revisions after it</p>
            {SCHEMES.map((s) => (
              <label key={s.value} className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer">
                <input type="radio" name="rev-scheme" checked={form.scheme === s.value} onChange={() => set('scheme', s.value)} />
                <span className="w-20 font-medium">{s.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-sm text-gray-700">
          A new drawing goes: <span className="font-mono font-medium">{preview(form).join(' → ')} …</span>
        </p>
        <p className="text-xs text-gray-500">A change applies to revisions made from now on; existing revisions keep their labels.</p>
        {canEdit && (
          <button type="button" onClick={save} disabled={busy || !changed || !form.original_label.trim()} className="btn-primary px-4 py-1.5 disabled:opacity-40">
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}
