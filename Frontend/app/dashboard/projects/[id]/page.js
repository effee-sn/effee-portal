'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { STAGE_STYLE } from '@/lib/salesOptions';
import { TableSkeleton } from '@/components/Skeleton';
import { SideCard, SideRow, KeyFacts } from '@/components/DetailSide';
import { StatusBadge, STATUS_STYLE, ProjectModal, DeleteModal } from '@/components/projects/ProjectForms';

/**
 * Projects → one project: its details, cost and linked enquiry, and its
 * change history. Edit and Delete as on the list.
 */

const PROJECTS = '/dashboard/projects';
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null);
const when = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// History: readable field names and values.
const FIELD_LABEL = {
  name: 'Name', description: 'Description', status: 'Status', enquiry_id: 'Linked enquiry', owner_id: 'Owner',
  start_date: 'Start date', end_date: 'End date', cost: 'Cost', cost_currency: 'Cost currency',
};
const ACTION_LABEL = { CREATE: 'Created', UPDATE: 'Changed', DELETE: 'Deleted' };

function History({ projectId, users }) {
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet(`/projects/${projectId}/history?page=${page}&limit=20`, { silent: true })
      .then((r) => { if (!cancelled) { setItems((prev) => (page === 1 ? r.data : [...(prev || []), ...r.data])); setTotal(r.meta.pagination.total); } })
      .catch(() => { if (!cancelled) setItems((prev) => prev || []); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [projectId, page]);

  const show = (field, v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (field === 'status') return STATUS_STYLE[v]?.label ?? v;
    if (field === 'owner_id') return users.find((u) => u.id === Number(v))?.name ?? `#${v}`;
    if (field === 'start_date' || field === 'end_date') return fmtDate(v) ?? String(v);
    return String(v);
  };

  if (items === null) return <TableSkeleton cols={3} rows={3} />;
  if (items.length === 0) return <p className="text-sm text-gray-400">No history recorded.</p>;
  return (
    <div>
      <ol className="space-y-3">
        {items.map((e) => {
          const changes = e.changes && typeof e.changes === 'object' ? e.changes : {};
          const fields = e.action === 'UPDATE' ? Object.entries(changes).filter(([, v]) => v && typeof v === 'object' && 'from' in v) : [];
          return (
            <li key={e.id} className="border-l-2 border-gray-200 pl-3">
              <p className="text-sm text-gray-800">
                <span className="font-medium">{ACTION_LABEL[e.action] || e.action}</span>
                <span className="text-gray-500"> by {e.actor_label || e.actor_email || 'system'} · {when(e.created_at)}</span>
              </p>
              {fields.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {fields.map(([k, v]) => (
                    <li key={k} className="text-xs text-gray-600 break-words">
                      <span className="text-gray-500">{FIELD_LABEL[k] || k}:</span>{' '}
                      <span className="line-through text-gray-400">{show(k, v.from)}</span> → <span className="text-gray-800">{show(k, v.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {items.length < total && (
        <button type="button" onClick={() => { setBusy(true); setPage((p) => p + 1); }} disabled={busy} className="mt-4 btn-secondary px-3 py-1.5">
          {busy ? 'Loading…' : 'Show older'}
        </button>
      )}
    </div>
  );
}

export default function ProjectPage() {
  useAuth();
  const { id } = useParams();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();
  const has = (code) => me?.is_system || can(code);
  const canView = has('PROJECT_VIEW');
  const canEdit = has('PROJECT_EDIT');
  const canDelete = has('PROJECT_DELETE');

  const [project, setProject] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null); // 'edit' | 'delete'
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    try { setProject((await apiGet(`/projects/${id}`)).data); }
    catch { setNotFound(true); }
  }, [id]);

  useEffect(() => {
    if (permLoading || !canView) return undefined;
    let cancelled = false;
    (async () => {
      try { const p = (await apiGet(`/projects/${id}`)).data; if (!cancelled) setProject(p); }
      catch { if (!cancelled) setNotFound(true); }
    })();
    apiGet('/lookup/users').then((u) => { if (!cancelled) setUsers(Array.isArray(u) ? u : u?.data || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, permLoading, canView]);

  if (permLoading || (canView && !project && !notFound)) {
    return <div className="p-4"><div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={4} rows={4} /></div></div>;
  }
  if (!canView || notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">{notFound ? 'Project not found' : 'Access Denied'}</p>
        <Link href={PROJECTS} className="text-sm text-[var(--ams-primary)] hover:underline mt-1">Back to projects</Link>
      </div>
    );
  }

  const e = project.enquiry;
  const stage = e ? STAGE_STYLE[e.stage] : null;
  const cost = project.cost != null ? formatMoney(project.cost, project.cost_currency) : null;

  return (
    <div className="space-y-4 p-4 pb-10">
      <header className="bg-white rounded border border-gray-200 px-5 py-4">
        <Link href={PROJECTS} className="text-sm text-gray-500 hover:text-gray-800">← Projects</Link>
        <div className="flex items-start gap-4 mt-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-500">{project.code}</span>
              <StatusBadge status={project.status} />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mt-1 break-words">{project.name}</h1>
            <KeyFacts items={[
              ['Project cost', cost],
              ['Owner', project.owner?.name],
              ['Linked enquiry', e ? <Link key="enq" href={`/dashboard/sales/enquiries/${e.id}`} className="text-[var(--ams-primary)] hover:underline">{e.ref_no}</Link> : null],
              ['Start', fmtDate(project.start_date)],
              ['End', fmtDate(project.end_date)],
            ]} />
          </div>
          <div className="flex gap-2 shrink-0">
            {canEdit && <button type="button" onClick={() => setModal('edit')} className="btn-primary px-3 py-1.5">Edit</button>}
            {canDelete && <button type="button" onClick={() => setModal('delete')} className="btn-danger px-3 py-1.5">Delete</button>}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <section className="bg-white rounded border border-gray-200">
            <div className="px-4 py-2.5 border-b border-gray-100"><h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</h2></div>
            <div className="px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap break-words">
              {project.description || <span className="text-gray-400">No description.</span>}
            </div>
          </section>
          <section className="bg-white rounded border border-gray-200">
            <div className="px-4 py-2.5 border-b border-gray-100"><h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">History</h2></div>
            <div className="px-4 py-3"><History key={historyKey} projectId={project.id} users={users} /></div>
          </section>
        </div>

        <aside className="space-y-4">
          <SideCard title="Cost">
            <SideRow name="Project cost">{cost ?? 'Not entered'}</SideRow>
            <SideRow name="Currency" mono>{project.cost_currency}</SideRow>
            <p className="text-[11px] text-gray-500">Entered on the project for now — later it will come from the linked enquiry&apos;s final costing value.</p>
          </SideCard>
          <SideCard title="Linked enquiry">
            {e ? (
              <>
                <SideRow name="Enquiry" mono>
                  <Link href={`/dashboard/sales/enquiries/${e.id}`} className="text-[var(--ams-primary)] hover:underline">{e.ref_no}</Link>
                </SideRow>
                <SideRow name="Title">{e.title}</SideRow>
                <SideRow name="Customer">{e.customer?.name}</SideRow>
                <SideRow name="Stage">{stage ? <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ color: stage.color, backgroundColor: stage.bg }}>{stage.label}</span> : e.stage}</SideRow>
              </>
            ) : <p className="text-sm text-gray-400">Not linked to an enquiry.</p>}
          </SideCard>
          <SideCard title="Record">
            <SideRow name="Created">{fmtDate(project.created_at)}</SideRow>
            <SideRow name="Updated">{fmtDate(project.updated_at)}</SideRow>
          </SideCard>
        </aside>
      </div>

      {modal === 'edit' && (
        <ProjectModal project={project} users={users} onClose={() => setModal(null)}
          onSaved={() => { load(); setHistoryKey((k) => k + 1); }} />
      )}
      {modal === 'delete' && <DeleteModal project={project} onClose={() => setModal(null)} onDeleted={() => router.push(PROJECTS)} />}
    </div>
  );
}
