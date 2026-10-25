'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { STAGE_INFO, STAGE_STYLE } from '@/lib/salesOptions';
import InfoTip from '@/components/InfoTip';
import { Card } from '@/components/DashboardKit';
import { SkeletonLine, TableSkeleton } from '@/components/Skeleton';
import { invalidateSalesConfig } from '@/lib/useSalesConfig';

/**
 * Sales configuration — a section of Administrator → Configuration:
 *   - Stage probability — win % per stage, used for the weighted pipeline.
 *   - Applications — the list an enquiry's application is picked from.
 *   - Reminders — when follow-ups are reminded, per medium (and for reviews).
 *
 * Shown with SALES_CONFIG_VIEW; changes need SALES_CONFIG_CREATE / EDIT / DELETE.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

// ── Stage probability ────────────────────────────────────────────────────────
function ProbabilityCard({ canEdit }) {
  const [rows, setRows]     = useState(null);
  const [draft, setDraft]   = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState({ type: '', text: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet('/sales/stage-probabilities');
        if (cancelled) return;
        setRows(res.data);
        setDraft(Object.fromEntries(res.data.map((r) => [r.stage, String(r.probability)])));
      } catch (err) { if (!cancelled) setMsg({ type: 'error', text: err.message }); }
    })();
    return () => { cancelled = true; };
  }, []);

  const dirty = rows?.some((r) => !r.fixed && String(r.probability) !== draft[r.stage]);
  const invalid = rows?.some((r) => {
    if (r.fixed) return false;
    const v = draft[r.stage];
    return v === '' || !/^\d+$/.test(v) || Number(v) > 100;
  });

  const save = async () => {
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      const items = rows.filter((r) => !r.fixed).map((r) => ({ stage: r.stage, probability: Number(draft[r.stage]) }));
      const res = await apiPut('/sales/stage-probabilities', { items });
      invalidateSalesConfig();
      setRows(res.data);
      setDraft(Object.fromEntries(res.data.map((r) => [r.stage, String(r.probability)])));
      setMsg({ type: 'ok', text: 'Probabilities saved.' });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setSaving(false); }
  };

  const reset = () => {
    setDraft(Object.fromEntries(rows.map((r) => [r.stage, String(r.probability)])));
    setMsg({ type: '', text: '' });
  };

  return (
    <Card title="Stage probability"
      action={canEdit && rows && (
        <div className="flex items-center gap-2">
          {dirty && <button type="button" onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Reset</button>}
          <button type="button" onClick={save} disabled={!dirty || invalid || saving}
            className="px-3 py-1.5 text-xs font-medium text-white rounded-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--ams-primary)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}>
      <p className="px-4 pt-3 text-xs text-gray-500">
        The chance an enquiry at each stage turns into an order. Used for the <span className="font-medium text-gray-700">weighted
        pipeline</span> (expected value × probability) and shown on every enquiry.
      </p>
      {msg.text && (
        <p className={`mx-4 mt-3 px-3 py-2 rounded text-sm border ${msg.type === 'error'
          ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>{msg.text}</p>
      )}
      {!rows ? (
        <div className="p-4 space-y-3">{Array.from({ length: 8 }).map((_, i) => <SkeletonLine key={i} className="h-7 w-full" />)}</div>
      ) : (
        <ul className="px-2 py-2">
          {rows.map((r) => {
            const v = r.fixed ? r.probability : Number(draft[r.stage]) || 0;
            const bad = !r.fixed && (draft[r.stage] === '' || !/^\d+$/.test(draft[r.stage]) || Number(draft[r.stage]) > 100);
            return (
              <li key={r.stage} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_5.5rem] items-center gap-3 px-2 py-1.5 rounded-md hover:bg-gray-50">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm text-gray-700 truncate">
                    {STAGE_STYLE[r.stage]?.label || r.stage}
                    {r.stage === 'CONTACTED' && <span className="text-[11px] text-gray-400"> · incoming</span>}
                  </span>
                  {STAGE_INFO[r.stage] && (
                    <InfoTip label={`About ${STAGE_STYLE[r.stage]?.label || r.stage}`} className="shrink-0">
                      <span className="block font-semibold mb-0.5">{STAGE_STYLE[r.stage]?.label}</span>
                      <span className="block">{STAGE_INFO[r.stage].what}</span>
                      <span className="block mt-1.5 text-gray-300"><span className="text-white">Who:</span> {STAGE_INFO[r.stage].who}</span>
                      <span className="block text-gray-300"><span className="text-white">To reach it:</span> {STAGE_INFO[r.stage].enter}</span>
                    </InfoTip>
                  )}
                </div>
                <span className="relative h-2 rounded-sm bg-gray-100" aria-hidden="true">
                  {v > 0 && <span className="absolute inset-y-0 left-0 rounded-r-[4px]"
                    style={{ width: `${Math.min(100, v)}%`, backgroundColor: 'var(--ams-primary)' }} />}
                </span>
                {r.fixed || !canEdit ? (
                  <span className="text-sm tabular-nums text-right text-gray-700 pr-1" title={r.fixed ? 'Fixed' : undefined}>
                    {r.probability}%{r.fixed && <span className="text-[11px] text-gray-400"> fixed</span>}
                  </span>
                ) : (
                  <label className="flex items-center justify-end gap-1">
                    <span className="sr-only">{STAGE_STYLE[r.stage]?.label} probability</span>
                    <input type="number" min={0} max={100} step={1} inputMode="numeric" value={draft[r.stage]}
                      onChange={(e) => { setDraft((d) => ({ ...d, [r.stage]: e.target.value })); setMsg({ type: '', text: '' }); }}
                      className={`w-16 text-sm text-right tabular-nums border rounded px-2 py-1 ${bad ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                    <span className="text-sm text-gray-500">%</span>
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── Reminders ────────────────────────────────────────────────────────────────
const KIND_LABEL = {
  SITE_VISIT: 'Site visit', MEETING: 'Meeting', TEAMS: 'Teams', CALL: 'Call', EMAIL: 'Email', REVIEW: 'Internal review',
};
const UNIT_MIN = { min: 1, h: 60, d: 1440 };

/** 1440 → "1 day", 180 → "3 h", 90 → "90 min". */
function formatOffset(min) {
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? '' : 's'}`;
  if (min % 60 === 0) return `${min / 60} h`;
  return `${min} min`;
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const sortDesc = (list) => [...list].sort((a, b) => b - a);

function ReminderRow({ row, offsets, canEdit, onChange }) {
  const [amount, setAmount] = useState('');
  const [unit, setUnit]     = useState('h');
  const [err, setErr]       = useState('');

  const add = () => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) return setErr('Enter a whole number');
    const min = n * UNIT_MIN[unit];
    if (min > 10080) return setErr('At most 7 days before');
    if (offsets.includes(min)) return setErr('Already in the list');
    if (offsets.length >= 5) return setErr('At most 5 reminders');
    onChange(sortDesc([...offsets, min]));
    setAmount(''); setErr('');
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-32 shrink-0 text-sm text-gray-700">{KIND_LABEL[row.kind] || row.kind}</span>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {offsets.map((o) => (
            <span key={o} className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 tabular-nums">
              {formatOffset(o)} before
              {canEdit && offsets.length > 1 && (
                <button type="button" onClick={() => onChange(offsets.filter((x) => x !== o))}
                  aria-label={`Remove ${formatOffset(o)} reminder`}
                  className="ml-0.5 text-gray-400 hover:text-red-600 cursor-pointer leading-none">&times;</button>
              )}
            </span>
          ))}
        </div>
        {canEdit && offsets.length < 5 && (
          <div className="flex items-center gap-1">
            <input type="number" min={1} step={1} inputMode="numeric" value={amount} placeholder="e.g. 3"
              aria-label={`New ${KIND_LABEL[row.kind]} reminder`}
              onChange={(e) => { setAmount(e.target.value); setErr(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              className="w-16 text-sm text-right tabular-nums border border-gray-300 rounded px-2 py-1" />
            <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit"
              className="text-sm border border-gray-300 rounded px-1.5 py-1 bg-white">
              <option value="min">min</option>
              <option value="h">hours</option>
              <option value="d">days</option>
            </select>
            <button type="button" onClick={add}
              className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer px-1">Add</button>
          </div>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-red-600 sm:pl-34">{err}</p>}
    </li>
  );
}

function RemindersCard({ canEdit }) {
  const [rows, setRows]     = useState(null);
  const [draft, setDraft]   = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState({ type: '', text: '' });

  const load = (data) => {
    setRows(data);
    setDraft(Object.fromEntries(data.map((r) => [r.kind, r.offsets])));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet('/sales/reminder-schedules');
        if (!cancelled) load(res.data);
      } catch (err) { if (!cancelled) setMsg({ type: 'error', text: err.message }); }
    })();
    return () => { cancelled = true; };
  }, []);

  const changed = rows?.filter((r) => !sameList(r.offsets, draft[r.kind] || [])) || [];

  const save = async () => {
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      const res = await apiPut('/sales/reminder-schedules', {
        items: changed.map((r) => ({ kind: r.kind, offsets: draft[r.kind] })),
      });
      load(res.data);
      setMsg({ type: 'ok', text: 'Reminder timings saved. They apply to every open follow-up from the next check.' });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setSaving(false); }
  };

  const reset = () => { load(rows); setMsg({ type: '', text: '' }); };

  return (
    <Card title="Reminders"
      action={canEdit && rows && (
        <div className="flex items-center gap-2">
          {changed.length > 0 && <button type="button" onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Reset</button>}
          <button type="button" onClick={save} disabled={!changed.length || saving}
            className="px-3 py-1.5 text-xs font-medium text-white rounded-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--ams-primary)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}>
      <p className="px-4 pt-3 text-xs text-gray-500">
        When the person holding the enquiry is reminded of a follow-up — in the portal, by push and by email — by the
        medium it&apos;s planned for. A reminder whose time had already passed when the follow-up was scheduled is skipped;
        the last one always goes. Follow-ups with only a date are reminded at 9:00 AM that day, plus 9:00 AM on any
        whole day set before it.
      </p>
      {msg.text && (
        <p className={`mx-4 mt-3 px-3 py-2 rounded text-sm border ${msg.type === 'error'
          ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>{msg.text}</p>
      )}
      {!rows ? (
        <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonLine key={i} className="h-7 w-full" />)}</div>
      ) : (
        <ul className="divide-y divide-gray-100 mt-2">
          {rows.map((r) => (
            <ReminderRow key={r.kind} row={r} offsets={draft[r.kind] || []} canEdit={canEdit}
              onChange={(list) => { setDraft((d) => ({ ...d, [r.kind]: list })); setMsg({ type: '', text: '' }); }} />
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Applications ─────────────────────────────────────────────────────────────
function ApplicationModal({ app, onClose, onSaved }) {
  const isEdit = Boolean(app);
  const [form, setForm] = useState({
    name: app?.name || '',
    description: app?.description || '',
    sort_order: app ? String(app.sort_order) : '0',
    is_active: app ? app.is_active : true,
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = { ...form, sort_order: Number(form.sort_order) || 0 };
      const res = isEdit ? await apiPut(`/sales/applications/${app.id}`, body) : await apiPost('/sales/applications', body);
      onSaved(res.data);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{isEdit ? 'Edit application' : 'New application'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div>
            <label className={label}>Name<span className="text-red-500"> *</span></label>
            <input name="name" value={form.name} onChange={change} required maxLength={120} placeholder="e.g. Annealing" className="ams-input" />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea name="description" value={form.description} onChange={change} rows={2} maxLength={1000} className="ams-input resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4 items-end">
            <div>
              <label className={label}>Order in list</label>
              <input name="sort_order" type="number" min={0} value={form.sort_order} onChange={change} className="ams-input" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({ app, onClose, onDeleted, onDeactivate }) {
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);
  const inUse = app.enquiry_count > 0;
  const del = async () => {
    setSaving(true); setError('');
    try { await apiDelete(`/sales/applications/${app.id}`); onDeleted(app.id); onClose(); }
    catch (err) { setError(err.message); setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-2">Delete application</h2>
        {inUse ? (
          <p className="text-sm text-gray-500 mb-4">
            <span className="font-medium text-gray-700">{app.name}</span> is used by {app.enquiry_count}{' '}
            {app.enquiry_count === 1 ? 'enquiry' : 'enquiries'}, so it can&apos;t be deleted. Mark it inactive instead — it
            disappears from new enquiries and stays on existing ones.
          </p>
        ) : (
          <p className="text-sm text-gray-500 mb-4">Delete <span className="font-medium text-gray-700">{app.name}</span>? This cannot be undone.</p>
        )}
        {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm mb-3">{error}</div>}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          {inUse ? (
            app.is_active && onDeactivate && (
              <button onClick={() => { onDeactivate(app); onClose(); }} className="btn-primary flex-1 justify-center py-2">Mark inactive</button>
            )
          ) : (
            <button onClick={del} disabled={saving} className="btn-danger flex-1 justify-center py-2">{saving ? 'Deleting…' : 'Delete'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function ApplicationsCard({ canCreate, canEdit, canDelete }) {
  const [apps, setApps]   = useState(null);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet('/sales/applications');
        if (!cancelled) setApps(res.data);
      } catch (err) { if (!cancelled) { setApps([]); setError(err.message); } }
    })();
    return () => { cancelled = true; };
  }, []);

  const sortApps = (list) => [...list].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const onSaved = (row) => {
    invalidateSalesConfig();
    setApps((prev) => sortApps(prev.some((a) => a.id === row.id)
      ? prev.map((a) => (a.id === row.id ? row : a)) : [...prev, row]));
  };
  const onDeleted = (id) => {
    invalidateSalesConfig();
    setApps((prev) => prev.filter((a) => a.id !== id));
  };

  const setActive = async (app, is_active) => {
    setError('');
    try { onSaved((await apiPut(`/sales/applications/${app.id}`, { is_active })).data); }
    catch (err) { setError(err.message); }
  };

  return (
    <Card title={<>Applications {apps && <span className="ml-1 text-gray-400 font-normal tabular-nums">{apps.length}</span>}</>}
      action={canCreate && (
        <button type="button" onClick={() => setModal({ type: 'edit', app: null })}
          className="px-3 py-1.5 text-xs font-medium text-white rounded-sm cursor-pointer" style={{ backgroundColor: 'var(--ams-primary)' }}>
          New
        </button>
      )}>
      <p className="px-4 pt-3 text-xs text-gray-500">
        What the enquiry is for — picked when an enquiry is raised. Inactive applications are hidden from new enquiries.
      </p>
      {error && <p className="mx-4 mt-3 px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      {!apps ? (
        <div className="p-4"><TableSkeleton cols={4} rows={3} /></div>
      ) : apps.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">No applications yet.{canCreate && ' Add the first one with New.'}</p>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="text-left font-medium px-4 py-2">Name</th>
                <th className="text-right font-medium px-3 py-2">Enquiries</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                {(canEdit || canDelete) && <th className="px-4 py-2"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {apps.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <p className={a.is_active ? 'text-gray-900 font-medium' : 'text-gray-400 font-medium'}>{a.name}</p>
                    {a.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{a.description}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{a.enquiry_count}</td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <button type="button" onClick={() => setActive(a, !a.is_active)} title={a.is_active ? 'Click to mark inactive' : 'Click to mark active'}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer ${a.is_active
                          ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </button>
                    ) : (
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${a.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {canEdit && <button type="button" onClick={() => setModal({ type: 'edit', app: a })}
                        className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer">Edit</button>}
                      {canDelete && <button type="button" onClick={() => setModal({ type: 'delete', app: a })}
                        className="ml-3 text-xs font-medium text-red-600 hover:underline cursor-pointer">Delete</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'edit' && <ApplicationModal app={modal.app} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'delete' && (
        <DeleteModal app={modal.app} onClose={() => setModal(null)} onDeleted={onDeleted}
          onDeactivate={canEdit ? (a) => setActive(a, false) : null} />
      )}
    </Card>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────
/** @param {{ has: (code: string) => boolean }} props */
export default function SalesConfig({ has }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <ProbabilityCard canEdit={has('SALES_CONFIG_EDIT')} />
      <div className="space-y-4">
        <ApplicationsCard canCreate={has('SALES_CONFIG_CREATE')} canEdit={has('SALES_CONFIG_EDIT')} canDelete={has('SALES_CONFIG_DELETE')} />
        <RemindersCard canEdit={has('SALES_CONFIG_EDIT')} />
      </div>
    </div>
  );
}
