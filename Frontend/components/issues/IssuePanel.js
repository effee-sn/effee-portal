'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiGet, apiPost, apiPut, apiDelete, apiPostForm } from '@/lib/api';
import useNav from '@/lib/useNav';
import { AREAS, areaKeyForPath } from '@/lib/navigation';
import SearchableSelect from '@/components/SearchableSelect';
import DocumentViewer from '@/components/DocumentViewer';
import {
  useIssues, ISSUE_TYPES, TYPE_LABEL, PRIORITIES, PRIORITY_LABEL, PRIORITY_STYLE, STATUS, withWhom, isOverdue,
} from '@/lib/issues';

/**
 * The issue panel — opens on the right beside the page (split screen on wide
 * screens, full width on a phone). Lists your issues, raises a new one tied to
 * the page you are on, and shows an issue's conversation. The rules are the
 * API's (Backend/src/modules/issues/issue.service.js); each issue says what
 * you may do on it (`can`).
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.xls,.xlsx,.doc,.docx,.csv';

const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function Chip({ cls, children, title }) {
  return <span title={title} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${cls}`}>{children}</span>;
}

export function StatusChip({ status }) {
  const s = STATUS[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <Chip cls={s.cls}>{s.label}</Chip>;
}

function Icon({ d, className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
const CLOSE_ICON = 'M6 18L18 6M6 6l12 12';
const BACK_ICON = 'M15 19l-7-7 7-7';
const CLIP_ICON = 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13';

/** Chosen files, each removable. */
function FileList({ files, onRemove }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700 max-w-full">
          <span className="truncate max-w-[180px]">{f.name}</span>
          <button type="button" onClick={() => onRemove(i)} className="text-gray-400 hover:text-red-600 cursor-pointer" aria-label={`Remove ${f.name}`}>×</button>
        </span>
      ))}
    </div>
  );
}

/** Up to five files. */
function useFiles() {
  const [files, setFiles] = useState([]);
  const add = (list) => setFiles((prev) => [...prev, ...Array.from(list || [])].slice(0, 5));
  const remove = (i) => setFiles((prev) => prev.filter((_, j) => j !== i));
  return { files, add, remove, clear: () => setFiles([]) };
}

/** Person or department — the department head then assigns. */
function TargetPicker({ targets, meId, value, onChange }) {
  const kind = value.kind;
  const users = (targets?.users || []).filter((u) => u.id !== meId)
    .map((u) => ({ value: String(u.id), label: u.name, sub: u.department || undefined }));
  const depts = (targets?.departments || []).filter((d) => d.head)
    .map((d) => ({ value: String(d.id), label: d.name, sub: `Head: ${d.head.name}` }));
  return (
    <div>
      <div className="inline-flex rounded border border-gray-300 overflow-hidden mb-2" role="group" aria-label="Send to">
        {[{ k: 'person', l: 'A person' }, { k: 'department', l: 'A department' }].map((o) => (
          <button key={o.k} type="button" aria-pressed={kind === o.k} onClick={() => onChange({ kind: o.k, id: '' })}
            className={`px-2.5 py-1 text-xs cursor-pointer ${kind === o.k ? 'bg-[var(--ams-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {o.l}
          </button>
        ))}
      </div>
      <SearchableSelect
        options={kind === 'person' ? users : depts}
        value={value.id}
        onChange={(id) => onChange({ kind, id })}
        placeholder={kind === 'person' ? 'Choose a person…' : 'Choose a department…'}
      />
      {kind === 'department' && (
        <p className="text-xs text-gray-400 mt-1">It waits for the department head, who assigns it to someone in the team.</p>
      )}
    </div>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────
const TABS = [
  { k: 'assigned', l: 'For me' },
  { k: 'raised', l: 'Raised by me' },
  { k: 'watching', l: 'Watching' },
  { k: 'queue', l: 'My department', head: true },
];
const STATUS_TABS = [
  { k: 'open', l: 'Open' },
  { k: 'resolved', l: 'To confirm' },
  { k: 'done', l: 'Closed' },
];

function IssueCard({ i, onOpen, showWhom = true }) {
  return (
    <button type="button" onClick={() => onOpen(i.id)}
      className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-[11px] text-gray-400">{i.ref_no}</span>
        <Chip cls="bg-gray-100 text-gray-600">{TYPE_LABEL[i.type] || i.type}</Chip>
        {i.priority !== 'NORMAL' && <Chip cls={PRIORITY_STYLE[i.priority]}>{PRIORITY_LABEL[i.priority]}</Chip>}
        <StatusChip status={i.status} />
        {isOverdue(i) && <Chip cls="bg-red-50 text-red-700" title={`Due ${fmtDate(i.due_date)}`}>Overdue</Chip>}
      </div>
      <p className="text-sm font-medium text-gray-800 mt-1 line-clamp-2">{i.title}</p>
      {i.entity_label && <p className="text-xs text-gray-500 mt-0.5 truncate">About {i.entity_label}</p>}
      <p className="text-xs text-gray-400 mt-1 flex items-center gap-x-3 flex-wrap">
        {showWhom && <span>With {withWhom(i)}</span>}
        <span>From {i.raised_by?.name}</span>
        <span>{ago(i.updated_at)}</span>
        {i._count?.comments > 0 && <span>{i._count.comments} {i._count.comments === 1 ? 'reply' : 'replies'}</span>}
      </p>
    </button>
  );
}

function IssueList({ initialTab, summary, onOpen, version }) {
  const [tab, setTab] = useState(initialTab || 'assigned');
  const [status, setStatus] = useState(initialTab === 'raised' && summary?.to_confirm ? 'resolved' : 'open');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const tabs = TABS.filter((t) => !t.head || summary?.heads_department);

  useEffect(() => {
    let live = true;
    apiGet(`/issues?tab=${tab}&status=${status}&limit=50`, { silent: true })
      .then((r) => { if (live) { setRows(r.data); setError(''); } })
      .catch((err) => { if (live) { setRows([]); setError(err.message); } });
    return () => { live = false; };
  }, [tab, status, version]);

  const count = (k) => (k === 'assigned' ? summary?.assigned : k === 'queue' ? summary?.queue : k === 'raised' ? summary?.to_confirm : 0);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex gap-1 px-3 pt-2 border-b border-gray-200 overflow-x-auto scrollbar-hide shrink-0">
        {tabs.map((t) => (
          <button key={t.k} type="button" onClick={() => setTab(t.k)}
            className={`px-2.5 py-2 text-sm whitespace-nowrap border-b-2 -mb-px cursor-pointer ${tab === t.k ? 'border-[var(--ams-primary)] text-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}{count(t.k) > 0 && <span className="ml-1 text-[10px] font-semibold text-white bg-red-500 rounded-full px-1.5 py-0.5">{count(t.k)}</span>}
          </button>
        ))}
      </div>
      <div className="flex gap-1 px-4 py-2 shrink-0">
        {STATUS_TABS.map((s) => (
          <button key={s.k} type="button" onClick={() => setStatus(s.k)}
            className={`px-2 py-0.5 rounded text-xs cursor-pointer ${status === s.k ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s.l}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
        {rows === null ? <p className="px-4 py-6 text-sm text-gray-400">Loading…</p>
          : rows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-gray-400">Nothing here.</p>
            : rows.map((i) => <IssueCard key={i.id} i={i} onOpen={onOpen} showWhom={tab !== 'assigned'} />)}
      </div>
    </div>
  );
}

/** The issues raised on one record (the ones you can see). */
function RecordIssues({ record, onOpen, onNew, version }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ tab: 'record', entity_type: record.entity_type, entity_id: String(record.entity_id), limit: '50' });
    apiGet(`/issues?${q}`, { silent: true }).then((r) => { if (live) setRows(r.data); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [record.entity_type, record.entity_id, version]);
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="px-4 py-3 border-b border-gray-200 shrink-0 flex items-center justify-between gap-2">
        <p className="text-sm text-gray-600 min-w-0 truncate">On <span className="font-medium text-gray-800">{record.entity_label}</span></p>
        <button type="button" onClick={onNew} className="btn-primary px-2.5 py-1 text-xs shrink-0">Raise issue</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows === null ? <p className="px-4 py-6 text-sm text-gray-400">Loading…</p>
          : rows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-gray-400">No issues on this record that you can see.</p>
            : rows.map((i) => <IssueCard key={i.id} i={i} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

// ── New issue ────────────────────────────────────────────────────────────────
function NewIssue({ me, targets, context, onCreated }) {
  const [form, setForm] = useState({ type: 'QUESTION', title: '', description: '', priority: 'NORMAL', due_date: '' });
  const [to, setTo] = useState({ kind: 'person', id: '' });
  const [watchers, setWatchers] = useState('');
  const [watcherIds, setWatcherIds] = useState([]);
  const [about, setAbout] = useState(true); // attach the page / record
  const { files, add, remove } = useFiles();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const change = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); setError(''); };
  const userName = (id) => targets?.users?.find((u) => u.id === id)?.name || `#${id}`;

  const submit = async (e) => {
    e.preventDefault();
    if (!to.id && form.type !== 'BUG') { setError('Choose who it is for — a person or a department'); return; }
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
      if (to.id) fd.append(to.kind === 'person' ? 'assignee_id' : 'department_id', to.id);
      fd.append('watcher_ids', JSON.stringify(watcherIds));
      if (about && context) {
        for (const k of ['module', 'entity_type', 'entity_id', 'entity_label', 'page_url']) {
          if (context[k]) fd.append(k, String(context[k]));
        }
      }
      files.forEach((f) => fd.append('files', f));
      const res = await apiPostForm('/issues', fd);
      onCreated(res.data);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
      {context?.entity_label && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded border text-sm ${about ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-gray-200 bg-gray-50 text-gray-400 line-through'}`}>
          <span className="min-w-0 truncate">About {context.entity_label}</span>
          <button type="button" onClick={() => setAbout((v) => !v)} className="ml-auto text-xs underline shrink-0 cursor-pointer">
            {about ? 'Remove' : 'Add back'}
          </button>
        </div>
      )}
      <div>
        <label className={label}>Type</label>
        <div className="grid grid-cols-4 gap-1">
          {ISSUE_TYPES.map((t) => (
            <button key={t.value} type="button" aria-pressed={form.type === t.value} onClick={() => setForm({ ...form, type: t.value })}
              className={`px-1 py-1.5 rounded border text-xs cursor-pointer ${form.type === t.value ? 'border-[var(--ams-primary)] bg-[var(--ams-primary-mid)] text-[var(--ams-primary)] font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={label}>For<span className="text-red-500"> *</span></label>
        <TargetPicker targets={targets} meId={me?.id} value={to} onChange={setTo} />
        {form.type === 'BUG' && !to.id && <p className="text-xs text-gray-400 mt-1">Leave empty and it goes to the portal administrator.</p>}
      </div>
      <div>
        <label className={label}>Subject<span className="text-red-500"> *</span></label>
        <input name="title" value={form.title} onChange={change} required maxLength={191} className="ams-input" placeholder="What do you need?" />
      </div>
      <div>
        <label className={label}>Details<span className="text-red-500"> *</span></label>
        <textarea name="description" value={form.description} onChange={change} required rows={5} className="ams-input resize-y"
          placeholder="What is needed, by when, and anything that helps" />
        <label className="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline cursor-pointer">
          <Icon d={CLIP_ICON} className="w-3.5 h-3.5" /> Attach files
          <input type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
        <FileList files={files} onRemove={remove} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Priority</label>
          <select name="priority" value={form.priority} onChange={change} className="ams-input">
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Needed by</label>
          <input type="date" name="due_date" value={form.due_date} onChange={change} className="ams-input" />
        </div>
      </div>
      <div>
        <label className={label}>Keep informed</label>
        <SearchableSelect
          options={(targets?.users || []).filter((u) => u.id !== me?.id && !watcherIds.includes(u.id)).map((u) => ({ value: String(u.id), label: u.name, sub: u.department || undefined }))}
          value={watchers}
          onChange={(v) => { if (v) setWatcherIds((ids) => [...ids, Number(v)]); setWatchers(''); }}
          placeholder="Add a person…"
        />
        {watcherIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {watcherIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700">
                {userName(id)}
                <button type="button" onClick={() => setWatcherIds((ids) => ids.filter((x) => x !== id))} className="text-gray-400 hover:text-red-600 cursor-pointer" aria-label="Remove">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-2">{saving ? 'Sending…' : 'Send issue'}</button>
    </form>
  );
}

// ── One issue ────────────────────────────────────────────────────────────────
function IssueDetail({ id, me, targets, onChanged, onGone }) {
  const nav = useNav();
  const { close } = useIssues();
  const [issue, setIssue] = useState(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState(null); // 'resolve' | 'assign' | 'reopen' | 'cancel' | 'close'
  const [note, setNote] = useState('');
  const [to, setTo] = useState({ kind: 'person', id: '' });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [addWatcher, setAddWatcher] = useState('');
  const { files, add, remove, clear } = useFiles();
  const endRef = useRef(null);

  const load = useCallback(() => {
    apiGet(`/issues/${id}`, { silent: true }).then((r) => { setIssue(r.data); setError(''); })
      .catch((err) => setError(err.status === 404 ? 'This issue is not there, or you cannot see it.' : err.message));
  }, [id]);
  useEffect(() => { setIssue(null); setAction(null); load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [issue?.comments?.length]);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fn();
      if (res?.data === null) { onGone(); return; }
      if (res?.data) setIssue(res.data);
      setAction(null); setNote('');
      onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const send = (e) => {
    e?.preventDefault();
    if (!reply.trim() && !files.length) return;
    const fd = new FormData();
    fd.append('body', reply.trim());
    files.forEach((f) => fd.append('files', f));
    run(async () => { const r = await apiPostForm(`/issues/${id}/comments`, fd); setReply(''); clear(); return r; });
  };

  const submitAction = (e) => {
    e.preventDefault();
    if (action === 'resolve') run(() => apiPost(`/issues/${id}/resolve`, { resolution: note }));
    else if (action === 'reopen') run(() => apiPost(`/issues/${id}/reopen`, { note }));
    else if (action === 'cancel') run(() => apiPost(`/issues/${id}/cancel`, { note }));
    else if (action === 'close') run(() => apiPost(`/issues/${id}/close`, { note: note || undefined }));
    else if (action === 'assign') {
      if (!to.id) { setError('Choose a person or a department'); return; }
      run(() => apiPost(`/issues/${id}/assign`, { [to.kind === 'person' ? 'assignee_id' : 'department_id']: Number(to.id), note: note || undefined }));
    }
  };

  if (error && !issue) return <p className="px-4 py-6 text-sm text-red-600">{error}</p>;
  if (!issue) return <p className="px-4 py-6 text-sm text-gray-400">Loading…</p>;

  const can = issue.can || {};
  const openRecord = () => {
    if (!issue.page_url) return;
    close();
    nav(issue.page_url);
  };
  const ACTION_TEXT = {
    resolve: { title: 'How was it resolved?', button: 'Mark resolved', required: true, placeholder: 'What was done — the person who raised it confirms' },
    reopen: { title: 'Why reopen it?', button: 'Reopen', required: true, placeholder: 'What is still not right' },
    cancel: { title: 'Why cancel it?', button: 'Cancel issue', required: true, placeholder: 'Not needed any more because…' },
    close: { title: 'Close it', button: 'Confirm & close', required: false, placeholder: 'A note (optional)' },
    assign: { title: 'Move it to', button: 'Move', required: false, placeholder: 'A note for them (optional)' },
  };
  const a = action ? ACTION_TEXT[action] : null;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs text-gray-400">{issue.ref_no}</span>
            <Chip cls="bg-gray-100 text-gray-600">{TYPE_LABEL[issue.type]}</Chip>
            <StatusChip status={issue.status} />
            {issue.reopened_count > 0 && <Chip cls="bg-amber-50 text-amber-800">Reopened {issue.reopened_count}×</Chip>}
          </div>
          <h3 className="text-base font-semibold text-gray-800 break-words">{issue.title}</h3>
          {issue.entity_label && (
            <button type="button" onClick={openRecord} disabled={!issue.page_url}
              className="text-xs text-blue-600 hover:underline cursor-pointer disabled:text-gray-500 disabled:no-underline text-left">
              About {issue.entity_label}
            </button>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <div><dt className="text-gray-400">From</dt><dd className="text-gray-700">{issue.raised_by?.name}</dd></div>
            <div><dt className="text-gray-400">With</dt><dd className="text-gray-700">{withWhom(issue)}{issue.department && issue.assignee ? <span className="text-gray-400"> · {issue.department.name}</span> : null}</dd></div>
            <div>
              <dt className="text-gray-400">Priority</dt>
              <dd>{can.edit ? (
                <select value={issue.priority} onChange={(e) => run(() => apiPut(`/issues/${id}`, { priority: e.target.value }))}
                  className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700">
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              ) : <Chip cls={PRIORITY_STYLE[issue.priority]}>{PRIORITY_LABEL[issue.priority]}</Chip>}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Needed by</dt>
              <dd className={isOverdue(issue) ? 'text-red-700 font-medium' : 'text-gray-700'}>{can.edit ? (
                <input type="date" value={issue.due_date ? issue.due_date.slice(0, 10) : ''}
                  onChange={(e) => run(() => apiPut(`/issues/${id}`, { due_date: e.target.value || null }))}
                  className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700" />
              ) : fmtDate(issue.due_date)}{isOverdue(issue) ? ' · overdue' : ''}</dd>
            </div>
          </dl>
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words pt-1">{issue.description}</p>
          {issue.files?.length > 0 && <Files files={issue.files} onView={setViewing} />}
          <Watchers issue={issue} me={me} targets={targets} value={addWatcher}
            onAdd={(uid) => { setAddWatcher(''); run(() => apiPost(`/issues/${id}/watchers`, { user_id: Number(uid) })); }}
            onRemove={(uid) => run(() => apiDelete(`/issues/${id}/watchers/${uid}`))} />
        </div>

        {/* Actions */}
        {(can.start || can.resolve || can.assign || can.take || can.close || can.reopen || can.cancel) && (
          <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
            {can.take && <button type="button" disabled={busy} onClick={() => run(() => apiPost(`/issues/${id}/assign`, { assignee_id: me.id }))} className="btn-primary px-2.5 py-1 text-xs">Take it</button>}
            {can.start && <button type="button" disabled={busy} onClick={() => run(() => apiPost(`/issues/${id}/start`, {}))} className="btn-secondary px-2.5 py-1 text-xs cursor-pointer">Start</button>}
            {can.resolve && <button type="button" onClick={() => { setAction('resolve'); setNote(''); }} className="btn-primary px-2.5 py-1 text-xs">Resolve</button>}
            {can.close && <button type="button" onClick={() => { setAction('close'); setNote(''); }} className="btn-primary px-2.5 py-1 text-xs">Confirm & close</button>}
            {can.reopen && <button type="button" onClick={() => { setAction('reopen'); setNote(''); }} className="btn-secondary px-2.5 py-1 text-xs cursor-pointer">Reopen</button>}
            {can.assign && <button type="button" onClick={() => { setAction('assign'); setNote(''); setTo({ kind: 'person', id: '' }); }} className="btn-secondary px-2.5 py-1 text-xs cursor-pointer">{issue.assignee ? 'Move / assign' : 'Assign'}</button>}
            {can.cancel && <button type="button" onClick={() => { setAction('cancel'); setNote(''); }} className="px-2.5 py-1 text-xs text-gray-500 hover:text-red-600 cursor-pointer">Cancel issue</button>}
          </div>
        )}
        {a && (
          <form onSubmit={submitAction} className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
            <p className="text-xs font-semibold text-gray-600">{a.title}</p>
            {action === 'assign' && <TargetPicker targets={targets} meId={null} value={to} onChange={setTo} />}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} required={a.required}
              placeholder={a.placeholder} className="ams-input resize-y text-sm" />
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn-primary px-3 py-1 text-xs">{busy ? 'Saving…' : a.button}</button>
              <button type="button" onClick={() => setAction(null)} className="btn-secondary px-3 py-1 text-xs cursor-pointer">Back</button>
            </div>
          </form>
        )}
        {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}

        {/* Conversation */}
        <div className="px-4 py-3 space-y-3">
          {issue.comments.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No replies yet.</p>}
          {issue.comments.map((c) => (c.kind === 'EVENT' ? (
            <p key={c.id} className="text-[11px] text-gray-400 text-center">
              <span className="text-gray-500">{c.author?.name || 'System'}</span> · {c.body} · {ago(c.created_at)}
            </p>
          ) : (
            <div key={c.id} className={`rounded-lg px-3 py-2 ${c.author_id === me?.id ? 'bg-[var(--ams-primary-mid)] ml-6' : 'bg-gray-50 mr-6'}`}>
              <p className="text-xs text-gray-500 mb-0.5"><span className="font-medium text-gray-700">{c.author?.name || 'Someone'}</span> · {ago(c.created_at)}</p>
              {c.body && <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{c.body}</p>}
              {c.files?.length > 0 && <Files files={c.files} onView={setViewing} />}
            </div>
          )))}
          <div ref={endRef} />
        </div>
      </div>

      {/* Reply */}
      {can.comment && (
        <form onSubmit={send} className="border-t border-gray-200 px-3 py-2 shrink-0 bg-white">
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Write a reply…  (Ctrl+Enter to send)"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }}
            className="ams-input resize-none text-sm" />
          <FileList files={files} onRemove={remove} />
          <div className="flex items-center justify-between mt-1.5">
            <label className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
              <Icon d={CLIP_ICON} className="w-3.5 h-3.5" /> Attach
              <input type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
            </label>
            <button type="submit" disabled={busy || (!reply.trim() && !files.length)} className="btn-primary px-3 py-1 text-xs disabled:opacity-50">Send</button>
          </div>
        </form>
      )}

      {viewing && (
        <DocumentViewer endpoint={`/issues/files/${viewing.id}/download`} fileName={viewing.file_name}
          mimeType={viewing.mime_type} size={viewing.size_bytes} label={issue.ref_no} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function Files({ files, onView }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {files.map((f) => (
        <button key={f.id} type="button" onClick={() => onView(f)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-gray-200 bg-white text-xs text-blue-700 hover:bg-blue-50 cursor-pointer max-w-full">
          <Icon d={CLIP_ICON} className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[180px]">{f.file_name}</span>
          <span className="text-gray-400 shrink-0">{fmtSize(f.size_bytes)}</span>
        </button>
      ))}
    </div>
  );
}

function Watchers({ issue, me, targets, value, onAdd, onRemove }) {
  const ids = issue.watchers.map((w) => w.user_id);
  const mayRemove = (uid) => uid === me?.id || issue.raised_by_id === me?.id || me?.is_system;
  const options = (targets?.users || [])
    .filter((u) => !ids.includes(u.id) && u.id !== issue.raised_by_id && u.id !== issue.assignee_id)
    .map((u) => ({ value: String(u.id), label: u.name, sub: u.department || undefined }));
  const open = !['CLOSED', 'CANCELLED'].includes(issue.status);
  return (
    <div className="text-xs pt-1">
      <span className="text-gray-400">Kept informed: </span>
      {issue.watchers.length === 0 && <span className="text-gray-400">nobody</span>}
      {issue.watchers.map((w) => (
        <span key={w.user_id} className="inline-flex items-center gap-1 mr-1.5 mb-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
          {w.user?.name}
          {mayRemove(w.user_id) && <button type="button" onClick={() => onRemove(w.user_id)} className="text-gray-400 hover:text-red-600 cursor-pointer" aria-label={`Remove ${w.user?.name}`}>×</button>}
        </span>
      ))}
      {open && (
        <div className="mt-1 max-w-xs">
          <SearchableSelect options={options} value={value} onChange={(v) => v && onAdd(v)} placeholder="Add someone to keep informed…" />
        </div>
      )}
    </div>
  );
}

// ── The panel ────────────────────────────────────────────────────────────────
export default function IssuePanel({ me, summary, onSummary }) {
  const { view, record, version, open, close, changed } = useIssues();
  const pathname = usePathname();
  const [targets, setTargets] = useState(null);
  const [history, setHistory] = useState([]); // views to go back to

  useEffect(() => {
    if (view && !targets) apiGet('/issues/targets', { silent: true }).then((r) => setTargets(r.data)).catch(() => {});
  }, [view, targets]);

  // Close on Escape.
  useEffect(() => {
    if (!view) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, close]);

  if (!view) return null;

  // Where a new issue comes from: the record this page registered, else the app and page.
  const areaKey = areaKeyForPath(pathname);
  const area = AREAS.find((x) => x.key === areaKey);
  const context = {
    module: record?.module || areaKey,
    entity_type: record?.entity_type,
    entity_id: record?.entity_id,
    entity_label: record?.entity_label || (area && pathname !== '/dashboard/issues' ? `${area.label} — ${area.items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.label || 'page'}` : undefined),
    page_url: pathname !== '/dashboard/issues' ? pathname : undefined,
  };

  const go = (v) => { setHistory((h) => [...h, view]); open(v); };
  const back = () => { const prev = history[history.length - 1]; setHistory((h) => h.slice(0, -1)); open(prev || { mode: 'list' }); };
  const afterChange = () => { changed(); onSummary?.(); };

  const title = view.mode === 'new' ? 'Raise an issue' : view.mode === 'issue' ? 'Issue' : view.mode === 'record' ? 'Issues on this record' : 'My issues';

  return (
    <aside role="complementary" aria-label="Issues"
      className="fixed inset-x-0 bottom-0 top-14 z-40 lg:static lg:inset-auto lg:z-auto w-full lg:w-[440px] xl:w-[480px] shrink-0 flex flex-col bg-white border-l border-gray-200 shadow-xl lg:shadow-none print:hidden">
      <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-gray-200">
        {(view.mode !== 'list' || history.length > 0) && (
          <button type="button" onClick={back} className="p-1 rounded text-gray-500 hover:bg-gray-100 cursor-pointer" aria-label="Back"><Icon d={BACK_ICON} /></button>
        )}
        <h2 className="text-sm font-semibold text-gray-800 flex-1 truncate">{title}</h2>
        {view.mode !== 'new' && (
          <button type="button" onClick={() => go({ mode: 'new' })} className="btn-primary px-2.5 py-1 text-xs">New issue</button>
        )}
        <button type="button" onClick={close} className="p-1 rounded text-gray-500 hover:bg-gray-100 cursor-pointer" aria-label="Close issues panel"><Icon d={CLOSE_ICON} /></button>
      </div>

      {view.mode === 'list' && <IssueList initialTab={view.tab} summary={summary} version={version} onOpen={(id) => go({ mode: 'issue', id })} />}
      {view.mode === 'record' && record && (
        <RecordIssues record={record} version={version} onOpen={(id) => go({ mode: 'issue', id })} onNew={() => go({ mode: 'new' })} />
      )}
      {view.mode === 'new' && (
        <NewIssue me={me} targets={targets} context={context}
          onCreated={(i) => { afterChange(); setHistory([]); open({ mode: 'issue', id: i.id }); }} />
      )}
      {view.mode === 'issue' && (
        <IssueDetail key={view.id} id={view.id} me={me} targets={targets} onChanged={afterChange}
          onGone={() => { afterChange(); setHistory([]); open({ mode: 'list' }); }} />
      )}
    </aside>
  );
}
