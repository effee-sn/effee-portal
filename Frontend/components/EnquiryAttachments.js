'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, apiDelete, apiPostForm, downloadFile } from '@/lib/api';
import { STAGE_STYLE } from '@/lib/salesOptions';
import { ListSkeleton } from '@/components/Skeleton';

/** Small chip naming the stage a document was uploaded in. */
function StageTag({ stage }) {
  const s = STAGE_STYLE[stage];
  if (!s) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
      style={{ color: s.color, backgroundColor: s.bg }}>Added at {s.label}</span>
  );
}

const ACCEPT = '.pdf,.xls,.xlsx,.doc,.docx,.csv,.png,.jpg,.jpeg';

// Single-document slots: one *current* version; replacing keeps the old one
// as history. Offers are handled separately (every revision stays current).
const SLOTS = [
  { kind: 'FORMAT_PDF',   label: 'Enquiry Format (PDF)' },
  { kind: 'FORMAT_EXCEL', label: 'Enquiry Format (Excel)' },
  { kind: 'CONCEPT',      label: 'Concept Document' },
  { kind: 'POWER_CALC',   label: 'Power Source Calculation (Excel)' },
  { kind: 'COSTING',      label: 'Costing Document' },
  { kind: 'COSTING_REVIEW', label: 'Costing Review Document' },
];
const KIND_LABEL = { ...Object.fromEntries(SLOTS.map((s) => [s.kind, s.label])), OFFER: 'Offer' };

const fmtSize = (b) => {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '');

function DocIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

/** Version badge: "v3" for documents, "Rev 3" for offers. Current is filled, history is outlined. */
function VersionTag({ a, current }) {
  const text = a.kind === 'OFFER' ? `Rev ${a.version}` : `v${a.version}`;
  return (
    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 shrink-0 tabular-nums ${current
      ? 'text-[var(--ams-primary)] bg-[var(--ams-primary-mid)]' : 'text-gray-500 border border-gray-200'}`}>
      {text}
    </span>
  );
}

/** "by Name · 03 Oct 2026" plus the upload note. */
function Meta({ a }) {
  return (
    <>
      <p className="text-[11px] text-gray-500 mt-0.5">
        {a.uploaded_by ? `${a.uploaded_by} · ` : ''}{fmtDate(a.created_at)}
        {a.superseded_at && <span className="text-gray-400"> · replaced {fmtDate(a.superseded_at)}</span>}
      </p>
      {a.note && <p className="text-xs text-gray-600 mt-0.5 italic break-words">&ldquo;{a.note}&rdquo;</p>}
    </>
  );
}

const ALL_KINDS = ['FORMAT_PDF', 'FORMAT_EXCEL', 'CONCEPT', 'COSTING', 'OFFER'];

/**
 * Documents panel. By default shows all kinds in a card; pass `kinds` to scope
 * it to specific document types and `bare` to drop the card chrome, so it can
 * be embedded inline (e.g. one kind per stage in the process view). `onChanged`
 * fires after any successful upload/delete/sent change.
 *
 * Every document is versioned: re-uploading creates the next version and the
 * previous one moves to that slot's history (still downloadable). Deleting the
 * current version restores the one before it.
 */
export default function EnquiryAttachments({
  enquiryId, canEdit, kinds = ALL_KINDS, bare = false, onChanged,
}) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [pending, setPending] = useState(null); // { kind, file, note } awaiting confirm
  const [openHistory, setOpenHistory] = useState({}); // kind -> bool
  const fileRef = useRef(null);
  const pendingKind = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiGet(`/sales/enquiries/${enquiryId}/attachments`, { silent: true }); setItems(res.data || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, [enquiryId]);

  useEffect(() => { load(); }, [load]);

  const reload = async () => { await load(); onChanged?.(); };

  const currentOf = (kind) => items.find((a) => a.kind === kind && !a.superseded_at) || null;
  const historyOf = (kind) => items.filter((a) => a.kind === kind && a.superseded_at);
  const offers = items.filter((a) => a.kind === 'OFFER');
  const latestOfferId = offers[0]?.id; // list is newest version first
  const slots = SLOTS.filter((s) => kinds.includes(s.kind));
  const showOffers = kinds.includes('OFFER');

  const pick = (kind) => { pendingKind.current = kind; setError(''); fileRef.current?.click(); };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) setPending({ kind: pendingKind.current, file, note: '' });
  };

  const upload = async () => {
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', pending.file);
      fd.append('kind', pending.kind);
      if (pending.note.trim()) fd.append('note', pending.note.trim());
      await apiPostForm(`/sales/enquiries/${enquiryId}/attachments`, fd);
      setPending(null);
      await reload();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const download = async (a) => {
    try { await downloadFile(`/sales/attachments/${a.id}/download`, a.file_name); }
    catch (err) { setError(err.message); }
  };

  const remove = async (a) => {
    const prev = a.kind !== 'OFFER' && historyOf(a.kind)[0];
    const msg = prev
      ? `Delete "${a.file_name}" (v${a.version})? v${prev.version} becomes the current version again.`
      : `Delete "${a.file_name}"?`;
    if (!window.confirm(msg)) return;
    setBusy(true); setError('');
    // Deleting can change which documents are current (and so the stage gates),
    // so refresh the parent enquiry too.
    try { await apiDelete(`/sales/attachments/${a.id}`); await reload(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const toggleSent = async (a) => {
    setBusy(true); setError('');
    // Sending an offer can advance the stage (Offer Released / Negotiation →
    // Follow-up), so refresh the parent enquiry too, not just the file list.
    try { await apiPost(`/sales/attachments/${a.id}/sent`, { sent: !a.sent_at }); await reload(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const fileLine = (a, current = true) => (
    <div className="flex items-center gap-2 min-w-0">
      <DocIcon />
      <VersionTag a={a} current={current} />
      <button onClick={() => download(a)} title="Download"
        className={`text-sm hover:underline truncate cursor-pointer ${current ? 'text-blue-600' : 'text-gray-600'}`}>
        {a.file_name}
      </button>
      <span className="text-xs text-gray-400 shrink-0">{fmtSize(a.size_bytes)}</span>
    </div>
  );

  // Plain render functions (not components): defining components inside the
  // render would remount them each keystroke and drop the note input's focus.

  /** The confirm-upload panel shown after picking a file, inline in its slot. */
  const pendingUpload = (kind) => (pending?.kind !== kind ? null : (
    <div className="mt-2 rounded-md border border-blue-200 bg-blue-50/50 p-2.5 space-y-2">
      <p className="text-xs text-gray-700 truncate">
        <span className="font-medium">{pending.file.name}</span>
        <span className="text-gray-500"> · {fmtSize(pending.file.size)}</span>
        {kind !== 'OFFER' && currentOf(kind) && (
          <span className="text-gray-500"> · becomes v{(items.filter((a) => a.kind === kind)[0]?.version || 0) + 1}, the current v{currentOf(kind).version} moves to history</span>
        )}
      </p>
      <input value={pending.note} onChange={(e) => setPending((p) => ({ ...p, note: e.target.value }))}
        maxLength={500} placeholder="What changed? (optional) — e.g. revised after price discussion"
        aria-label="Version note" className="w-full text-sm border border-gray-300 rounded px-2 py-1 bg-white" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setPending(null)} disabled={busy}
          className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer">Cancel</button>
        <button type="button" onClick={upload} disabled={busy}
          className="px-2.5 py-1 text-xs font-medium text-white rounded-sm cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--ams-primary)' }}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </div>
  ));

  const history = (kind) => {
    const past = historyOf(kind);
    if (past.length === 0) return null;
    const open = Boolean(openHistory[kind]);
    return (
      <div className="mt-2 border-t border-gray-100 pt-1.5">
        <button type="button" onClick={() => setOpenHistory((h) => ({ ...h, [kind]: !open }))} aria-expanded={open}
          className="text-[11px] font-medium text-gray-500 hover:text-gray-800 cursor-pointer">
          {open ? '▾' : '▸'} Previous versions ({past.length})
        </button>
        {open && (
          <ul className="mt-1 space-y-1.5" aria-label={`${KIND_LABEL[kind]} previous versions`}>
            {past.map((a) => (
              <li key={a.id} className="pl-1">
                <div className="flex items-center gap-2 flex-wrap">{fileLine(a, false)}<StageTag stage={a.stage} /></div>
                <Meta a={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const inner = (
    <div className="space-y-4">
      {error && <div className="px-3 py-2 rounded bg-red-50 border border-red-200 text-red-600 text-xs">{error}</div>}

      {/* Hidden shared file input */}
      <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />

      {loading ? (
        <ListSkeleton rows={2} />
      ) : (
          <>
            {/* Single-document slots (versioned) */}
            {slots.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {slots.map(({ kind, label }) => {
                const a = currentOf(kind);
                return (
                  <div key={kind} className="border border-gray-200 rounded-lg px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                    {a ? (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {fileLine(a)}
                            <Meta a={a} />
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-2 shrink-0 pt-0.5">
                              <button onClick={() => pick(kind)} disabled={busy || Boolean(pending)}
                                title="Upload a new version — this one is kept in history"
                                className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer">Replace</button>
                              <button onClick={() => remove(a)} disabled={busy}
                                className="text-xs text-red-500 hover:text-red-700 cursor-pointer">Delete</button>
                            </div>
                          )}
                        </div>
                      </>
                    ) : canEdit ? (
                      <button onClick={() => pick(kind)} disabled={busy || Boolean(pending)}
                        className="text-sm text-blue-600 hover:underline cursor-pointer">＋ Upload</button>
                    ) : (
                      <span className="text-sm text-gray-300">—</span>
                    )}
                    {pendingUpload(kind)}
                    {history(kind)}
                  </div>
                );
              })}
            </div>
            )}

            {/* Offers (every revision stays current) */}
            {showOffers && (
            <div className="border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Offers {offers.length ? `(${offers.length})` : ''}</p>
                {canEdit && (
                  <button onClick={() => pick('OFFER')} disabled={busy || Boolean(pending)}
                    className="text-xs font-medium text-blue-600 hover:underline cursor-pointer">＋ Add offer revision</button>
                )}
              </div>
              {pendingUpload('OFFER')}
              {offers.length === 0 ? (
                <p className="text-sm text-gray-300">No offers uploaded yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {offers.map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {fileLine(a, a.id === latestOfferId)}
                          {a.id === latestOfferId && offers.length > 1 && (
                            <span className="text-[10px] font-semibold text-gray-600">Latest</span>
                          )}
                          <StageTag stage={a.stage} />
                        </div>
                        <Meta a={a} />
                        {a.sent_at && <span className="text-[11px] text-green-600">Sent to customer · {fmtDate(a.sent_at)}</span>}
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 shrink-0 pt-0.5">
                          <button onClick={() => toggleSent(a)} disabled={busy}
                            className={`text-xs cursor-pointer ${a.sent_at ? 'text-gray-500 hover:text-gray-800' : 'text-green-600 hover:text-green-800'}`}>
                            {a.sent_at ? 'Unmark sent' : 'Mark sent'}
                          </button>
                          <button onClick={() => remove(a)} disabled={busy}
                            className="text-xs text-red-500 hover:text-red-700 cursor-pointer">Delete</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
          </>
      )}
    </div>
  );

  if (bare) return inner;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Documents &amp; Offers</h2>
      </div>
      <div className="px-5 py-4">{inner}</div>
    </div>
  );
}
