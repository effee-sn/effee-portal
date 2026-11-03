'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchFile, saveBlob } from '@/lib/api';

/**
 * Large view-only popup for a protected document, so looking at a file
 * doesn't mean downloading it. The file is fetched with the user's login and
 * shown inside the portal — nothing goes to an outside viewer (Office Online
 * would need a public link to the file). Download stays one click away.
 *
 *   PDF          the browser's own PDF viewer
 *   PNG / JPG    the image, fitted; click to see it full size
 *   Excel / CSV  a read-only table per sheet (SheetJS)
 *   Word .docx   the pages (docx-preview)
 *   Word .doc    not readable in a browser (old binary format) — download only
 */

/** Rows shown per sheet; a bigger sheet says how many more there are. */
const MAX_ROWS = 2000;

/** 'pdf' | 'image' | 'sheet' | 'docx' | 'none', from the type or the name. */
function viewKind(fileName = '', mime = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/^image\/(png|jpeg)$/.test(mime) || ['png', 'jpg', 'jpeg'].includes(ext)) return 'image';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet';
  if (ext === 'docx') return 'docx';
  return 'none';
}

const fmtSize = (b) => {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

/** Read-only sheet tabs + table. */
function SheetView({ sheets }) {
  const [tab, setTab] = useState(0);
  const sheet = sheets[tab];
  const width = Math.max(1, ...sheet.rows.map((r) => r.length));
  const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  return (
    <div className="flex flex-col h-full">
      {sheets.length > 1 && (
        <div className="flex gap-1 px-3 pt-2 border-b border-gray-200 overflow-x-auto shrink-0" role="tablist">
          {sheets.map((s, i) => (
            <button key={s.name} role="tab" aria-selected={i === tab} onClick={() => setTab(i)}
              className={`px-3 py-1.5 text-xs rounded-t whitespace-nowrap cursor-pointer ${i === tab
                ? 'bg-white border border-b-white border-gray-200 -mb-px font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto bg-white">
        {sheet.rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">This sheet is empty.</p>
        ) : (
          <table className="text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-100 z-10">
              <tr>
                <th className="border border-gray-200 px-2 py-1 text-gray-400 font-normal w-10" />
                {Array.from({ length: width }, (_, i) => (
                  <th key={i} className="border border-gray-200 px-2 py-1 text-gray-500 font-normal">{colName(i)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r, ri) => (
                <tr key={ri}>
                  <td className="border border-gray-200 px-2 py-1 text-gray-400 text-right bg-gray-50 tabular-nums">{ri + 1}</td>
                  {Array.from({ length: width }, (_, ci) => (
                    <td key={ci} className="border border-gray-200 px-2 py-1 text-gray-800 whitespace-pre-wrap align-top max-w-xs">{r[ci] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sheet.more > 0 && (
          <p className="p-3 text-xs text-amber-700">Showing the first {MAX_ROWS.toLocaleString()} rows — {sheet.more.toLocaleString()} more. Download the file to see them all.</p>
        )}
      </div>
    </div>
  );
}

/**
 * @param {{ endpoint: string, fileName: string, mimeType?: string, size?: number, label?: string, onClose: () => void }} props
 *   endpoint: the file's download route; label: e.g. "v2" / "Rev 3"
 */
export default function DocumentViewer({ endpoint, fileName, mimeType, size, label, onClose }) {
  const kind = viewKind(fileName, mimeType);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState('');
  const [sheets, setSheets] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(kind !== 'none');
  const [zoom, setZoom] = useState(false);
  const docxRef = useRef(null);

  // Esc closes; the page behind doesn't scroll.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  useEffect(() => {
    if (kind === 'none') return undefined;
    let cancelled = false;
    let objectUrl = '';
    (async () => {
      try {
        const raw = await fetchFile(endpoint);
        // The stored type, so the browser treats it as what it is (PDF viewer, image).
        const b = mimeType ? new Blob([raw], { type: mimeType }) : raw;
        if (cancelled) return;
        setBlob(b);
        if (kind === 'pdf' || kind === 'image') {
          objectUrl = URL.createObjectURL(b);
          setUrl(objectUrl);
        } else if (kind === 'sheet') {
          const XLSX = await import('xlsx');
          // Cells show as Excel shows them; dates without a format as 03-Nov-2026.
          const wb = XLSX.read(await b.arrayBuffer(), { type: 'array', cellDates: true, dateNF: 'dd-mmm-yyyy' });
          const list = wb.SheetNames.map((name) => {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: true });
            // Trailing empty rows (formatting reaching far down) are noise.
            while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
            return { name, rows: rows.slice(0, MAX_ROWS), more: Math.max(0, rows.length - MAX_ROWS) };
          });
          if (!cancelled) setSheets(list);
        } else if (kind === 'docx') {
          const { renderAsync } = await import('docx-preview');
          if (cancelled || !docxRef.current) return;
          docxRef.current.innerHTML = '';
          await renderAsync(b, docxRef.current, null, {
            inWrapper: true, ignoreLastRenderedPageBreak: true, breakPages: true,
            renderHeaders: true, renderFooters: true, renderFootnotes: true,
          });
        }
      } catch (err) {
        if (!cancelled) setError(kind === 'sheet' || kind === 'docx'
          ? `This file couldn't be shown (${err.message}). Download it to open it.`
          : err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [endpoint, kind, mimeType]);

  const [saving, setSaving] = useState(false);
  const download = async () => {
    setError('');
    if (blob) { saveBlob(blob, fileName); return; }
    setSaving(true);
    try { saveBlob(await fetchFile(endpoint), fileName); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  // At the page's root: an ancestor with a transform or overflow would clip a
  // fixed popup rendered in place.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`View ${fileName}`}
        className="w-full max-w-6xl h-full max-h-[94vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate" title={fileName}>{fileName}</p>
            <p className="text-[11px] text-gray-500">{[label, fmtSize(size)].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" onClick={download} disabled={saving}
            className="btn-secondary text-sm py-1.5 cursor-pointer disabled:opacity-50">
            {saving ? 'Downloading…' : 'Download'}
          </button>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 cursor-pointer text-xl leading-none">×</button>
        </div>

        <div className="flex-1 min-h-0 bg-gray-100 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 z-10">Opening…</div>
          )}
          {error ? (
            <div className="h-full flex items-center justify-center p-6">
              <p className="text-sm text-red-600 text-center max-w-md">{error}</p>
            </div>
          ) : kind === 'none' ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-medium text-gray-700">Preview not available for this file type</p>
              <p className="text-xs text-gray-500 max-w-sm">
                Old Word documents (.doc) can&apos;t be shown in a browser. Download it to open it in Word — or save
                it as .docx next time, and it will open here.
              </p>
              <button type="button" onClick={download} disabled={saving}
                className="mt-1 px-3 py-1.5 text-sm font-medium text-white rounded-sm cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--ams-primary)' }}>
                {saving ? 'Downloading…' : 'Download'}
              </button>
            </div>
          ) : kind === 'pdf' ? (
            url && <iframe src={url} title={fileName} className="w-full h-full border-0 bg-white" />
          ) : kind === 'image' ? (
            url && (
              <div className={`h-full overflow-auto flex ${zoom ? 'items-start justify-start' : 'items-center justify-center'} p-3`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL, not an optimisable asset */}
                <img src={url} alt={fileName} onClick={() => setZoom((z) => !z)}
                  title={zoom ? 'Click to fit the screen' : 'Click to see full size'}
                  className={`${zoom ? 'max-w-none cursor-zoom-out' : 'max-w-full max-h-full object-contain cursor-zoom-in'} shadow bg-white`} />
              </div>
            )
          ) : kind === 'sheet' ? (
            sheets && <SheetView sheets={sheets} />
          ) : (
            <div ref={docxRef} className="docx-view h-full overflow-auto" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
