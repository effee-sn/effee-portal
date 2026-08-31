'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, apiDelete, apiPostForm, downloadFile } from '@/lib/api';

const ACCEPT = '.pdf,.xls,.xlsx,.doc,.docx,.csv,.png,.jpg,.jpeg';

// Single-document slots (re-upload replaces). Offers are handled separately.
const SLOTS = [
  { kind: 'FORMAT_PDF',   label: 'Enquiry Format (PDF)' },
  { kind: 'FORMAT_EXCEL', label: 'Enquiry Format (Excel)' },
  { kind: 'CONCEPT',      label: 'Concept Document' },
  { kind: 'POWER_CALC',   label: 'Power Source Calculation (Excel)' },
  { kind: 'COSTING',      label: 'Costing Document' },
  { kind: 'COSTING_REVIEW', label: 'Costing Review Document' },
];

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

const ALL_KINDS = ['FORMAT_PDF', 'FORMAT_EXCEL', 'CONCEPT', 'COSTING', 'OFFER'];

/**
 * Documents panel. By default shows all kinds in a card; pass `kinds` to scope
 * it to specific document types and `bare` to drop the card chrome, so it can
 * be embedded inline (e.g. one kind per stage in the process view). `onChanged`
 * fires after any successful upload/delete/sent change.
 */
export default function EnquiryAttachments({
  enquiryId, canEdit, kinds = ALL_KINDS, bare = false, onChanged,
}) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
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

  const byKind = (kind) => items.find((a) => a.kind === kind) || null;
  const offers = items.filter((a) => a.kind === 'OFFER');
  const slots = SLOTS.filter((s) => kinds.includes(s.kind));
  const showOffers = kinds.includes('OFFER');

  const pick = (kind) => { pendingKind.current = kind; setError(''); fileRef.current?.click(); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', pendingKind.current);
      await apiPostForm(`/sales/enquiries/${enquiryId}/attachments`, fd);
      await reload();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const download = async (a) => {
    try { await downloadFile(`/sales/attachments/${a.id}/download`, a.file_name); }
    catch (err) { setError(err.message); }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.file_name}"?`)) return;
    setBusy(true); setError('');
    try { await apiDelete(`/sales/attachments/${a.id}`); await load(); }
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

  const FileLine = ({ a }) => (
    <div className="flex items-center gap-2 min-w-0">
      <DocIcon />
      <button onClick={() => download(a)} className="text-sm text-blue-600 hover:underline truncate cursor-pointer" title="Download">
        {a.file_name}
      </button>
      <span className="text-xs text-gray-400 shrink-0">{fmtSize(a.size_bytes)}</span>
    </div>
  );

  const inner = (
    <div className="space-y-4">
      {error && <div className="px-3 py-2 rounded bg-red-50 border border-red-200 text-red-600 text-xs">{error}</div>}

      {/* Hidden shared file input */}
      <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFile} className="hidden" />

      {loading ? (
        <p className="text-sm text-gray-400 py-2 text-center">Loading…</p>
      ) : (
          <>
            {/* Single-document slots */}
            {slots.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {slots.map(({ kind, label }) => {
                const a = byKind(kind);
                return (
                  <div key={kind} className="border border-gray-200 rounded-lg px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                    {a ? (
                      <div className="flex items-center justify-between gap-2">
                        <FileLine a={a} />
                        {canEdit && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => pick(kind)} disabled={busy}
                              className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer">Replace</button>
                            <button onClick={() => remove(a)} disabled={busy}
                              className="text-xs text-red-500 hover:text-red-700 cursor-pointer">Delete</button>
                          </div>
                        )}
                      </div>
                    ) : canEdit ? (
                      <button onClick={() => pick(kind)} disabled={busy}
                        className="text-sm text-blue-600 hover:underline cursor-pointer">＋ Upload</button>
                    ) : (
                      <span className="text-sm text-gray-300">—</span>
                    )}
                  </div>
                );
              })}
            </div>
            )}

            {/* Offers (multiple revisions) */}
            {showOffers && (
            <div className="border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Offers {offers.length ? `(${offers.length})` : ''}</p>
                {canEdit && (
                  <button onClick={() => pick('OFFER')} disabled={busy}
                    className="text-xs font-medium text-blue-600 hover:underline cursor-pointer">＋ Add offer revision</button>
                )}
              </div>
              {offers.length === 0 ? (
                <p className="text-sm text-gray-300">No offers uploaded yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {offers.map((a, idx) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">v{offers.length - idx}</span>
                          <FileLine a={a} />
                        </div>
                        {a.sent_at && <span className="text-[11px] text-green-600">Sent to customer · {fmtDate(a.sent_at)}</span>}
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 shrink-0">
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
