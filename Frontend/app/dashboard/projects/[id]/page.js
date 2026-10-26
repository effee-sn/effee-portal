'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import ProjectModal, { StatusBadge, formatMachineNo } from '@/components/projects/ProjectModal';
import ProjectBom from '@/components/projects/ProjectBom';

/**
 * Projects → one project. Overview: its details and its machines — each with
 * a Machine ID (given when it is added, never changed or reused), added,
 * renamed and removed here. BOM: the project's BOM, built per machine and
 * locked into tag numbers (components/projects/ProjectBom.js).
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function Field({ name, children }) {
  return (
    <div>
      <dt className={label}>{name}</dt>
      <dd className="text-sm text-gray-800 whitespace-pre-wrap break-words">{children || <span className="text-gray-400">—</span>}</dd>
    </div>
  );
}

/** Rename a machine or note what it is. */
function MachineModal({ projectId, machine, onClose, onSaved }) {
  const [form, setForm] = useState({ name: machine.name || '', description: machine.description || '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try { const r = await apiPut(`/projects/${projectId}/machines/${machine.id}`, form); onSaved(r.data); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-500">Machine</p>
            <h2 className="text-base font-semibold font-mono text-gray-800">{machine.machine_no}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
          <div>
            <label className={label} htmlFor="mc-name">Name</label>
            <input id="mc-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={191}
              placeholder="e.g. Panel A, Line 2 press" className="ams-input" />
          </div>
          <div>
            <label className={label} htmlFor="mc-desc">Description</label>
            <textarea id="mc-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3}
              placeholder="Optional" className="ams-input resize-y" />
          </div>
          <p className="text-[11px] text-gray-500">The Machine ID itself never changes.</p>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

export default function ProjectPage() {
  useAuth();
  const { id } = useParams();
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const canView = has('PROJECT_VIEW');
  const canEdit = has('PROJECT_EDIT');
  const canBom = has('BOM_VIEW');
  const [tab, setTab] = useState('overview');

  const [project, setProject] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [users, setUsers] = useState([]);
  const [numbering, setNumbering] = useState(null);
  const [editing, setEditing] = useState(false);
  const [machine, setMachine] = useState(null);
  const [add, setAdd] = useState({ count: '1', name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (permLoading || !canView) return undefined;
    let cancelled = false;
    apiGet(`/projects/${id}`, { silent: true })
      .then((r) => { if (!cancelled) setProject(r.data); })
      .catch(() => { if (!cancelled) setNotFound(true); });
    apiGet('/lookup/users', { silent: true }).then((r) => { if (!cancelled) setUsers(Array.isArray(r) ? r : r?.data || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, permLoading, canView]);

  // The next Machine IDs, to preview what "Add" gives.
  const loadNumbering = () => apiGet('/projects/machine-numbering', { silent: true }).then((r) => setNumbering(r.data)).catch(() => setNumbering(null));
  useEffect(() => {
    if (!canEdit) return undefined;
    let cancelled = false;
    apiGet('/projects/machine-numbering', { silent: true }).then((r) => { if (!cancelled) setNumbering(r.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [canEdit]);

  const count = Math.max(1, Math.min(50, Number(add.count) || 1));
  const preview = numbering
    ? count === 1 ? formatMachineNo(numbering, numbering.next_number)
      : `${formatMachineNo(numbering, numbering.next_number)} … ${formatMachineNo(numbering, numbering.next_number + count - 1)}`
    : null;

  const addMachines = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const before = new Set(project.machines.map((m) => m.id));
      const r = await apiPost(`/projects/${id}/machines`, { count, name: add.name || null });
      setProject(r.data);
      const added = r.data.machines.filter((m) => !before.has(m.id)).map((m) => m.machine_no);
      setNotice(`Added ${added.join(', ')}.`);
      setAdd({ count: '1', name: '' });
      loadNumbering();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const removeMachine = async (m) => {
    if (!window.confirm(`Remove machine ${m.machine_no}${m.name ? ` (${m.name})` : ''}? Its Machine ID won't be given out again.`)) return;
    setError(''); setNotice('');
    try {
      await apiDelete(`/projects/${id}/machines/${m.id}`);
      setProject((p) => ({ ...p, machines: p.machines.filter((x) => x.id !== m.id) }));
    } catch (err) { setError(err.message); }
  };

  if (permLoading || (canView && !project && !notFound)) {
    return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={4} rows={6} /></div>;
  }
  if (!canView || notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">{notFound ? 'Project not found' : 'Access Denied'}</p>
        <Link href="/dashboard/projects" className="text-sm text-[var(--ams-primary)] hover:underline">← Back to projects</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-10 max-w-6xl">
      <div className="bg-white rounded border border-gray-200 px-5 py-4">
        <Link href="/dashboard/projects" className="text-sm text-gray-500 hover:text-gray-800">← Projects</Link>
        <div className="flex items-start gap-3 mt-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold text-gray-500">{project.code}</p>
            <h1 className="text-lg font-semibold text-gray-800 break-words">{project.name}</h1>
            <div className="mt-1"><StatusBadge status={project.status} /></div>
          </div>
          {canEdit && <button type="button" onClick={() => setEditing(true)} className="btn-secondary px-4 py-1.5">Edit</button>}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 mt-4">
          <Field name="Owner">{project.owner?.name}</Field>
          <Field name="Linked enquiry">{project.enquiry ? `${project.enquiry.ref_no} — ${project.enquiry.title}` : null}</Field>
          <Field name="Start">{fmtDate(project.start_date)}</Field>
          <Field name="End">{fmtDate(project.end_date)}</Field>
        </dl>
        {project.description && <p className="text-sm text-gray-700 whitespace-pre-wrap mt-4">{project.description}</p>}
      </div>

      {canBom && (
        <div className="flex gap-1 border-b border-gray-200" role="tablist">
          {[{ key: 'overview', label: 'Overview' }, { key: 'bom', label: 'BOM' }].map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm -mb-px border-b-2 cursor-pointer ${tab === t.key ? 'border-[var(--ams-primary)] text-gray-800 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'bom' && canBom && <ProjectBom projectId={id} canEdit={has('BOM_EDIT')} canApprove={has('BOM_APPROVE')} />}

      {tab === 'overview' && <>
      {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
      {notice && <p className="px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}

      <div className="bg-white rounded border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Machines <span className="text-gray-400 font-normal tabular-nums">{project.machines.length}</span></h2>
          <p className="text-xs text-gray-500 mt-0.5">Each machine has its own Machine ID — the start of every tag number in this project&apos;s BOM. A Machine ID never changes and is never reused.</p>
        </div>

        {canEdit && (
          <form onSubmit={addMachines} className="px-4 py-3 border-b border-gray-200 flex items-end gap-3 flex-wrap">
            <div>
              <label className={label} htmlFor="add-count">Add</label>
              <input id="add-count" type="number" min={1} max={50} value={add.count} onChange={(e) => setAdd((a) => ({ ...a, count: e.target.value }))} className="ams-input w-24" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className={label} htmlFor="add-name">Name <span className="normal-case font-normal text-gray-400">(optional; numbered when adding several)</span></label>
              <input id="add-name" value={add.name} onChange={(e) => setAdd((a) => ({ ...a, name: e.target.value }))} maxLength={150} placeholder="e.g. Panel" className="ams-input" />
            </div>
            <button type="submit" disabled={busy} className="btn-primary px-4 py-2">{busy ? 'Adding…' : `Add machine${count === 1 ? '' : 's'}`}</button>
            {preview && <span className="text-xs text-gray-500 pb-2.5">→ <span className="font-mono text-gray-700">{preview}</span></span>}
          </form>
        )}

        {project.machines.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No machines yet.{canEdit && ' Add one above.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 560 }}>
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-4 py-2.5 font-normal">Machine ID</th>
                  <th className="px-3 py-2.5 font-normal">Name</th>
                  <th className="px-3 py-2.5 font-normal">Description</th>
                  <th className="px-3 py-2.5 font-normal">Added</th>
                  {canEdit && <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {project.machines.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100">
                    <td className="px-4 py-2.5 font-mono font-semibold text-gray-800 whitespace-nowrap">{m.machine_no}</td>
                    <td className="px-3 py-2.5 text-gray-800">{m.name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-xs truncate" title={m.description || undefined}>{m.description || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                    {canEdit && (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button type="button" onClick={() => setMachine(m)} className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer">Edit</button>
                        <button type="button" onClick={() => removeMachine(m)} className="ml-3 text-xs font-medium text-red-600 hover:underline cursor-pointer">Remove</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>}

      {editing && (
        <ProjectModal project={project} users={users} onClose={() => setEditing(false)}
          onSaved={(p) => setProject((prev) => ({ ...prev, ...p }))} />
      )}
      {machine && (
        <MachineModal projectId={id} machine={machine} onClose={() => setMachine(null)}
          onSaved={(m) => setProject((p) => ({ ...p, machines: p.machines.map((x) => (x.id === m.id ? m : x)) }))} />
      )}
    </div>
  );
}
