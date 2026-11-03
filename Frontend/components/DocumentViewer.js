'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchFile, saveBlob } from '@/lib/api';

// Same as lib/xlsxPictures (loaded only when a sheet is opened).
const EMU_PER_PX = 9525;

/**
 * Large view-only popup for a protected document, so looking at a file
 * doesn't mean downloading it. The file is fetched with the user's login and
 * shown inside the portal — nothing goes to an outside viewer (Office Online
 * would need a public link to the file). Download stays one click away.
 *
 *   PDF          the browser's own PDF viewer
 *   PNG / JPG    the image, fitted; click to see it full size
 *   Excel / CSV  a read-only grid per sheet (SheetJS) laid out as Excel has it —
 *                column widths, row heights, merged cells — with the .xlsx
 *                pictures in place (lib/xlsxPictures); not charts, shapes, colours
 *   Word .docx   the pages (docx-preview)
 *   Word .doc    not readable in a browser (old binary format) — download only
 */

/** Rows / columns shown per sheet; a bigger sheet says how many more there are. */
const MAX_ROWS = 2000;
const MAX_COLS = 150;
/** Excel's defaults: column 8.43 characters (64 px), row 15 pt (20 px). */
const DEFAULT_COL_PX = 64;
const DEFAULT_ROW_PX = 20;
const HEADER_PX = 22;
const ROWNUM_PX = 40;

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

const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/**
 * One sheet as Excel lays it out: its column widths, row heights, merged
 * cells, and the pictures from its drawing layer (lib/xlsxPictures).
 * Cell styles (colours, borders, fonts) aren't read — SheetJS's free edition
 * doesn't parse them.
 */
function buildSheet(XLSX, ws, name, pictures = []) {
  const cells = new Map();
  let lastRow = -1; let lastCol = -1;
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const c = ws[key];
    const text = c.w ?? (c.v == null ? '' : String(c.v));
    if (text === '') continue;
    const { r, c: col } = XLSX.utils.decode_cell(key);
    cells.set(`${r},${col}`, text);
    if (r > lastRow) lastRow = r;
    if (col > lastCol) lastCol = col;
  }
  const merges = (ws['!merges'] || []).filter((m) => m.s.r < MAX_ROWS && m.s.c < MAX_COLS);
  for (const m of merges) { lastRow = Math.max(lastRow, m.e.r); lastCol = Math.max(lastCol, m.e.c); }
  for (const p of pictures) {
    // A fixed-size picture ends where its size reaches, at default cell sizes.
    const end = p.to || (p.ext ? {
      row: p.from.row + Math.ceil((p.from.rowOff + p.ext.cy) / EMU_PER_PX / DEFAULT_ROW_PX),
      col: p.from.col + Math.ceil((p.from.colOff + p.ext.cx) / EMU_PER_PX / DEFAULT_COL_PX),
    } : p.from);
    lastRow = Math.max(lastRow, end.row); lastCol = Math.max(lastCol, end.col);
  }
  const nRows = Math.min(MAX_ROWS, lastRow + 1);
  const nCols = Math.min(MAX_COLS, lastCol + 1);

  const cols = ws['!cols'] || [];
  const rows = ws['!rows'] || [];
  const colW = Array.from({ length: nCols }, (_, i) => {
    const c = cols[i];
    if (c?.hidden) return 0;
    return Math.round(c?.wpx ?? (c?.wch != null ? c.wch * 7 + 5 : DEFAULT_COL_PX));
  });
  const rowH = Array.from({ length: nRows }, (_, i) => {
    const r = rows[i];
    if (r?.hidden) return 0;
    return Math.round(r?.hpx ?? (r?.hpt != null ? (r.hpt * 4) / 3 : DEFAULT_ROW_PX));
  });

  const span = new Map(); const covered = new Set();
  for (const m of merges) {
    const er = Math.min(m.e.r, nRows - 1); const ec = Math.min(m.e.c, nCols - 1);
    span.set(`${m.s.r},${m.s.c}`, { rs: er - m.s.r + 1, cs: ec - m.s.c + 1 });
    for (let r = m.s.r; r <= er; r += 1) for (let c = m.s.c; c <= ec; c += 1) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
  }
  return { name, nRows, nCols, cells, colW, rowH, span, covered, pictures, more: Math.max(0, lastRow + 1 - nRows) };
}

/**
 * A sheet's grid with its pictures on top. A picture's place is measured from
 * the rendered cells, so it stays with its cells when text makes a row taller
 * than in Excel.
 */
function SheetGrid({ sheet, onPreview }) {
  const wrapRef = useRef(null);
  const [boxes, setBoxes] = useState([]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    // Remounted per sheet (keyed), so a sheet without pictures keeps the empty start.
    if (!wrap || !sheet.pictures.length) return undefined;
    const measure = () => {
      const base = wrap.getBoundingClientRect();
      const heads = wrap.querySelectorAll('thead th[data-col]');
      const trs = wrap.querySelectorAll('tbody tr');
      const colX = []; const rowY = [];
      heads.forEach((th, i) => { const r = th.getBoundingClientRect(); colX[i] = [r.left - base.left, r.right - base.left]; });
      let prev = HEADER_PX;
      trs.forEach((tr, i) => {
        const r = tr.getBoundingClientRect();
        rowY[i] = r.height ? [r.top - base.top, r.bottom - base.top] : [prev, prev]; // hidden row
        prev = rowY[i][1];
      });
      // Past the drawn grid (a capped sheet): continue at Excel's default sizes.
      const x = (c) => (colX[c] ? colX[c][0] : (colX.at(-1)?.[1] ?? ROWNUM_PX) + (c - colX.length) * DEFAULT_COL_PX);
      const y = (r) => (rowY[r] ? rowY[r][0] : (rowY.at(-1)?.[1] ?? HEADER_PX) + (r - rowY.length) * DEFAULT_ROW_PX);
      setBoxes(sheet.pictures.map((p) => {
        const left = x(p.from.col) + p.from.colOff / EMU_PER_PX;
        const top = y(p.from.row) + p.from.rowOff / EMU_PER_PX;
        let width; let height;
        if (p.to) {
          width = x(p.to.col) + p.to.colOff / EMU_PER_PX - left;
          height = y(p.to.row) + p.to.rowOff / EMU_PER_PX - top;
        } else if (p.ext) {
          width = p.ext.cx / EMU_PER_PX; height = p.ext.cy / EMU_PER_PX;
        }
        return { ...p, left, top, width: Math.max(8, width || 96), height: Math.max(8, height || 96) };
      }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [sheet]);

  const totalW = ROWNUM_PX + sheet.colW.reduce((a, b) => a + b, 0);
  return (
    <div ref={wrapRef} className="relative inline-block align-top">
      <table className="text-xs border-collapse" style={{ tableLayout: 'fixed', width: totalW }}>
        <colgroup>
          <col style={{ width: ROWNUM_PX }} />
          {sheet.colW.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr style={{ height: HEADER_PX }}>
            <th className="sticky top-0 z-20 bg-gray-100 border border-gray-200" />
            {sheet.colW.map((w, i) => (
              <th key={i} data-col={i} className="sticky top-0 z-20 bg-gray-100 border border-gray-200 text-gray-500 font-normal overflow-hidden" style={w ? undefined : { padding: 0, borderWidth: 0 }}>
                {w ? colName(i) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rowH.map((h, r) => (
            <tr key={r} style={h ? { height: h } : { display: 'none' }}>
              <td className="border border-gray-200 px-1 text-gray-400 text-right bg-gray-50 tabular-nums">{r + 1}</td>
              {sheet.colW.map((w, c) => {
                const key = `${r},${c}`;
                if (sheet.covered.has(key)) return null;
                const s = sheet.span.get(key);
                return (
                  <td key={c} rowSpan={s?.rs} colSpan={s?.cs}
                    className="border border-gray-200 text-gray-800 align-top whitespace-pre-wrap break-words overflow-hidden"
                    style={w ? { padding: '1px 3px' } : { padding: 0, borderWidth: 0 }}>
                    {w ? sheet.cells.get(key) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {boxes.map((b, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the file, not an optimisable asset
        <img key={i} src={b.url} alt={b.name} title={`${b.name} — click to enlarge`} onClick={() => onPreview(b)}
          className="absolute z-10 object-contain cursor-zoom-in"
          style={{ left: b.left, top: b.top, width: b.width, height: b.height }} />
      ))}
    </div>
  );
}

/** Read-only sheet tabs + the Excel-like grid. */
function SheetView({ sheets, onPreview }) {
  const [tab, setTab] = useState(0);
  const sheet = sheets[tab];
  return (
    <div className="flex flex-col h-full">
      {sheets.length > 1 && (
        <div className="flex gap-1 px-3 pt-2 border-b border-gray-200 overflow-x-auto shrink-0" role="tablist">
          {sheets.map((s, i) => (
            <button key={s.name} role="tab" aria-selected={i === tab} onClick={() => setTab(i)}
              className={`px-3 py-1.5 text-xs rounded-t whitespace-nowrap cursor-pointer ${i === tab
                ? 'bg-white border border-b-white border-gray-200 -mb-px font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
              {s.name}
              {s.pictures.length > 0 && <span className="ml-1 text-[10px] text-gray-400">· {s.pictures.length} picture{s.pictures.length > 1 ? 's' : ''}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto bg-white">
        {sheet.nRows === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">This sheet is empty.</p>
        ) : (
          <SheetGrid key={sheet.name} sheet={sheet} onPreview={onPreview} />
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
  const [preview, setPreview] = useState(null); // a sheet picture shown large
  const docxRef = useRef(null);

  // The page behind doesn't scroll.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, []);
  // Esc closes the enlarged picture, else the viewer.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (preview) setPreview(null); else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview, onClose]);

  useEffect(() => {
    if (kind === 'none') return undefined;
    let cancelled = false;
    let objectUrl = '';
    let pictures = null;
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
          const buf = await b.arrayBuffer();
          // Cells show as Excel shows them; dates without a format as 03-Nov-2026.
          // cellStyles: column widths and row heights.
          const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellStyles: true, dateNF: 'dd-mmm-yyyy' });
          // Pictures are only in .xlsx (a zip: starts "PK"); a broken drawing
          // layer just means no pictures, not a failed view.
          const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
          if (head[0] === 0x50 && head[1] === 0x4b) {
            try { const { readPictures } = await import('@/lib/xlsxPictures'); pictures = await readPictures(buf); }
            catch { pictures = null; }
          }
          if (cancelled) return;
          setSheets(wb.SheetNames.map((name) => buildSheet(XLSX, wb.Sheets[name], name, pictures?.[name])));
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
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (pictures) import('@/lib/xlsxPictures').then(({ revokePictures }) => revokePictures(pictures));
    };
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
  // fixed popup rendered in place. (Opened by a click, so never on the server.)
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-1.5 sm:p-3"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`View ${fileName}`}
        className="w-full h-full bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden">
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
            sheets && <SheetView sheets={sheets} onPreview={setPreview} />
          ) : (
            <div ref={docxRef} className="docx-view h-full overflow-auto" />
          )}
          {preview && (
            <div className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
              onClick={() => setPreview(null)} role="dialog" aria-label={preview.name}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the file */}
              <img src={preview.url} alt={preview.name} className="max-w-full max-h-full object-contain bg-white shadow-2xl" />
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/80">{preview.name} · click or Esc to close</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
