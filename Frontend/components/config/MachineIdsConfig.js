'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { formatMachineNo } from '@/components/projects/ProjectModal';

/**
 * Machine IDs — a section of Administrator → Configuration.
 *
 * How project machines are numbered: prefix + optional separator (- or _) +
 * zero-padded number, e.g. M0001. Once any Machine ID is given out, the
 * format is fixed and the next number can only move forward.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const SEPARATORS = [
  { value: '', label: 'None' },
  { value: '-', label: 'Hyphen  -' },
  { value: '_', label: 'Underscore  _' },
];

/** @param {{ has: (code: string) => boolean }} props */
export default function MachineIdsConfig({ has }) {
  const canView = has('PROJECT_CONFIG_VIEW');
  const canEdit = has('PROJECT_CONFIG_EDIT');
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const show = (n) => {
    setSaved(n);
    setForm({ prefix: n.prefix, separator: n.separator, digits: String(n.digits), next_number: String(n.next_number) });
  };

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    apiGet('/projects/machine-numbering')
      .then((r) => { if (!cancelled) show(r.data); })
      .catch((e) => { if (!cancelled) { setSaved({}); setError(e.message); } });
    return () => { cancelled = true; };
  }, [canView]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view the Machine ID numbering.</p>
      </div>
    );
  }
  if (!saved || !form) return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={2} rows={3} /></div>;

  const used = (saved.machine_count ?? 0) > 0;
  const digits = Math.min(10, Math.max(1, Number(form.digits) || 1));
  const next = Math.max(1, Number(form.next_number) || 1);
  const preview = form.prefix ? formatMachineNo({ prefix: form.prefix.toUpperCase(), separator: form.separator, digits }, next) : '—';
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); setNotice(''); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const body = { prefix: form.prefix.trim().toUpperCase(), separator: form.separator, digits, next_number: next };
      if (used) { delete body.prefix; delete body.separator; delete body.digits; }
      const r = await apiPut('/projects/machine-numbering', body);
      show(r.data);
      setNotice(`Saved — the next machine gets ${r.data.preview}.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="bg-white rounded border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">Machine IDs</span>
        <span className="ml-2 text-xs text-gray-400">How project machines are numbered</span>
      </div>
      <div className="px-4 py-4 space-y-4 max-w-xl">
        {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
        {notice && <p className="px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}
        {used && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
            {saved.machine_count} Machine ID(s) are already given out, so the prefix, separator and digits are fixed. The next number can only move forward.
          </p>
        )}
        <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="mn-prefix">Prefix</label>
            <input id="mn-prefix" value={form.prefix} disabled={used} onChange={(e) => set('prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              required maxLength={20} placeholder="e.g. M" className="ams-input font-mono disabled:bg-gray-50" />
          </div>
          <div>
            <label className={label} htmlFor="mn-sep">Separator</label>
            <select id="mn-sep" value={form.separator} disabled={used} onChange={(e) => set('separator', e.target.value)} className="ams-input disabled:bg-gray-50">
              {SEPARATORS.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="mn-digits">Number of digits</label>
            <input id="mn-digits" type="number" min={1} max={10} value={form.digits} disabled={used} onChange={(e) => set('digits', e.target.value)} className="ams-input disabled:bg-gray-50" />
          </div>
          <div>
            <label className={label} htmlFor="mn-next">Next number</label>
            <input id="mn-next" type="number" min={1} value={form.next_number} onChange={(e) => set('next_number', e.target.value)} className="ams-input" />
          </div>
        </fieldset>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="text-xs text-gray-500">Next Machine ID will be</p>
          <p className="text-lg font-mono font-semibold text-gray-800 mt-0.5">{preview}</p>
        </div>
        {canEdit && <button type="submit" disabled={busy} className="btn-primary px-4 py-1.5">{busy ? 'Saving…' : 'Save'}</button>}
      </div>
    </form>
  );
}
