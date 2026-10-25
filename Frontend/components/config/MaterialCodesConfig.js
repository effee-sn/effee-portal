'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { formatImmCode } from '@/lib/materialOptions';

/**
 * Material codes — a section of Administrator → Configuration.
 *
 * The IMM code prefixes materials are numbered under: each prefix has an
 * optional separator (- or _), a number of digits and its next number, e.g.
 * IMM + "-" + 5 digits → IMM-00001. Once a prefix has materials, its format
 * is fixed and its next number can only move forward.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const SEPARATORS = [
  { value: '', label: 'None' },
  { value: '-', label: 'Hyphen  -' },
  { value: '_', label: 'Underscore  _' },
];

function PrefixModal({ prefix, onClose, onSaved }) {
  const isEdit = Boolean(prefix);
  const used = (prefix?.material_count ?? 0) > 0;
  const [form, setForm] = useState({
    prefix: prefix?.prefix || '',
    separator: prefix?.separator ?? '-',
    digits: String(prefix?.digits ?? 5),
    next_number: String(prefix?.next_number ?? 1),
    description: prefix?.description || '',
    is_active: prefix?.is_active ?? true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };

  const digits = Math.min(10, Math.max(1, Number(form.digits) || 1));
  const next = Math.max(1, Number(form.next_number) || 1);
  const preview = form.prefix ? formatImmCode({ prefix: form.prefix.toUpperCase(), separator: form.separator, digits }, next) : '—';

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = {
        prefix: form.prefix.trim().toUpperCase(), separator: form.separator, digits, next_number: next,
        description: form.description, is_active: form.is_active,
      };
      if (isEdit && used) { delete body.prefix; delete body.separator; delete body.digits; }
      const res = isEdit ? await apiPut(`/materials/prefixes/${prefix.id}`, body) : await apiPost('/materials/prefixes', body);
      onSaved(res.data);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? `Edit prefix ${prefix.prefix}` : 'New IMM code prefix'}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        <form onSubmit={submit} className="px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          {used && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
              {prefix.material_count} material(s) use this prefix, so its prefix, separator and digits are fixed. The next number can only move forward.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="pf-prefix">Prefix<span className="text-red-500"> *</span></label>
              <input id="pf-prefix" value={form.prefix} onChange={(e) => set('prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                required maxLength={20} disabled={used} placeholder="e.g. IMM" className="ams-input disabled:bg-gray-50 font-mono" />
            </div>
            <div>
              <label className={label} htmlFor="pf-sep">Separator</label>
              <select id="pf-sep" value={form.separator} onChange={(e) => set('separator', e.target.value)} disabled={used} className="ams-input disabled:bg-gray-50">
                {SEPARATORS.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="pf-digits">Number of digits</label>
              <input id="pf-digits" type="number" min={1} max={10} value={form.digits} onChange={(e) => set('digits', e.target.value)}
                disabled={used} className="ams-input disabled:bg-gray-50" />
            </div>
            <div>
              <label className={label} htmlFor="pf-next">Next number</label>
              <input id="pf-next" type="number" min={1} value={form.next_number} onChange={(e) => set('next_number', e.target.value)} className="ams-input" />
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-xs text-gray-500">Next code will be</p>
            <p className="text-lg font-mono font-semibold text-gray-800 mt-0.5">{preview}</p>
          </div>

          <div>
            <label className={label} htmlFor="pf-desc">Description</label>
            <input id="pf-desc" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={191}
              placeholder="e.g. Electrical items" className="ams-input" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            Active (available when adding materials)
          </label>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** @param {{ has: (code: string) => boolean }} props */
export default function MaterialCodesConfig({ has }) {
  const canView = has('MATERIAL_CONFIG_VIEW');
  const canCreate = has('MATERIAL_CONFIG_CREATE');
  const canEdit = has('MATERIAL_CONFIG_EDIT');
  const canDelete = has('MATERIAL_CONFIG_DELETE');

  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    apiGet('/materials/prefixes')
      .then((r) => { if (!cancelled) setRows(r.data); })
      .catch((e) => { if (!cancelled) { setRows([]); setError(e.message); } });
    return () => { cancelled = true; };
  }, [canView]);

  const upsert = (p) => setRows((prev) => {
    const next = prev.some((r) => r.id === p.id) ? prev.map((r) => (r.id === p.id ? p : r)) : [...prev, p];
    return next.sort((a, b) => a.prefix.localeCompare(b.prefix));
  });

  const remove = async (p) => {
    if (!window.confirm(`Delete prefix ${p.prefix}?`)) return;
    setError('');
    try { await apiDelete(`/materials/prefixes/${p.id}`); setRows((prev) => prev.filter((r) => r.id !== p.id)); }
    catch (e) { setError(e.message); }
  };

  if (canView && rows === null) {
    return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={6} rows={4} /></div>;
  }
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view material codes.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap">
        {canCreate && (
          <button onClick={() => setModal({ prefix: null })}
            className="shrink-0 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer" style={{ backgroundColor: 'var(--ams-primary)' }}>New</button>
        )}
        <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Material Codes</span>
        <span className="text-xs text-gray-400">IMM code prefixes and their numbering, used when adding materials</span>
      </div>
      {error && <p className="mx-3 mt-3 px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}

      {rows.length === 0 ? (
        <p className="py-14 text-center text-sm text-gray-400">No prefixes yet.{canCreate && ' Add the first one with New.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 720 }}>
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-3 py-3 font-normal">Prefix</th>
                <th className="px-3 py-3 font-normal">Next code</th>
                <th className="px-3 py-3 font-normal">Format</th>
                <th className="px-3 py-3 font-normal text-right">Materials</th>
                <th className="px-3 py-3 font-normal">Status</th>
                <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <span className="font-mono font-semibold text-gray-800">{p.prefix}</span>
                    {p.description && <span className="block text-xs text-gray-500">{p.description}</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-gray-700">{p.preview}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    separator {p.separator ? <code className="font-mono">{p.separator}</code> : 'none'} · {p.digits} digits
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{p.material_count}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${p.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {canEdit && <button onClick={() => setModal({ prefix: p })} className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer">Edit</button>}
                    {canDelete && p.material_count === 0 && (
                      <button onClick={() => remove(p)} className="ml-3 text-xs font-medium text-red-600 hover:underline cursor-pointer">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <PrefixModal prefix={modal.prefix} onClose={() => setModal(null)} onSaved={upsert} />}
    </div>
  );
}
