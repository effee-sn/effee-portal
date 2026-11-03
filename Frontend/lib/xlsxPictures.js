/**
 * Reads the pictures out of an .xlsx file, with where each one sits.
 *
 * An .xlsx is a zip: the cells are in xl/worksheets/*.xml, and pictures live
 * separately — xl/media/* — placed by each sheet's drawing layer
 * (xl/drawings/drawingN.xml: "picture X from cell D12 + offset to cell G20 +
 * offset"). The cell library (SheetJS) doesn't read that layer, so this does.
 * Charts and drawn shapes aren't pictures and aren't returned.
 *
 * Positions are Excel's: zero-based column/row plus an offset in EMU
 * (914 400 per inch; 9 525 per screen pixel).
 */
import JSZip from 'jszip';

export const EMU_PER_PX = 9525;

/** Media types a browser can show (EMF/WMF are Windows-only vector formats). */
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };

const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
/** Resolves a relationship target against the part that refers to it. */
function resolve(fromPart, target) {
  if (target.startsWith('/')) return target.slice(1);
  const out = [];
  for (const seg of (dirOf(fromPart) + target).split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
}
const relsOf = (part) => `${dirOf(part)}_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels`;

async function xml(zip, path) {
  const f = zip.file(path);
  return f ? new DOMParser().parseFromString(await f.async('text'), 'application/xml') : null;
}
/** Elements by local name, whatever the namespace prefix. */
const all = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const first = (node, name) => all(node, name)[0] || null;
const num = (node, name) => Number(first(node, name)?.textContent || 0);
/** The r:id / r:embed style attribute (namespaced). */
const rAttr = (el, name) => el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name) || el.getAttribute(`r:${name}`);

/** { rId: absolute part path } for a part's relationships, optionally of one type. */
async function rels(zip, part, typeSuffix) {
  const doc = await xml(zip, relsOf(part));
  const out = {};
  if (!doc) return out;
  for (const r of all(doc, 'Relationship')) {
    if (typeSuffix && !String(r.getAttribute('Type')).endsWith(typeSuffix)) continue;
    if (r.getAttribute('TargetMode') === 'External') continue;
    out[r.getAttribute('Id')] = resolve(part, r.getAttribute('Target'));
  }
  return out;
}

const cellPos = (el) => (el ? { col: num(el, 'col'), colOff: num(el, 'colOff'), row: num(el, 'row'), rowOff: num(el, 'rowOff') } : null);

/**
 * @param {ArrayBuffer} buffer an .xlsx file
 * @returns {Promise<Record<string, Array<{ url: string, from: object, to: object|null, ext: {cx:number,cy:number}|null, name: string }>>>}
 *   pictures per sheet name, each with an object URL — revoke with revokePictures()
 */
export async function readPictures(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const book = await xml(zip, 'xl/workbook.xml');
  if (!book) return {};
  const sheetPaths = await rels(zip, 'xl/workbook.xml');
  const media = new Map(); // path -> object URL (a picture can be used twice)
  const out = {};

  for (const sheet of all(book, 'sheet')) {
    const name = sheet.getAttribute('name');
    const sheetPart = sheetPaths[rAttr(sheet, 'id')];
    if (!sheetPart) continue;
    const drawings = Object.values(await rels(zip, sheetPart, '/drawing'));
    const pics = [];
    for (const drawingPart of drawings) {
      const doc = await xml(zip, drawingPart);
      if (!doc) continue;
      const images = await rels(zip, drawingPart, '/image');
      const anchors = [...all(doc, 'twoCellAnchor'), ...all(doc, 'oneCellAnchor'), ...all(doc, 'absoluteAnchor')];
      for (const anchor of anchors) {
        const from = cellPos(first(anchor, 'from'));
        const to = anchor.localName === 'twoCellAnchor' ? cellPos(first(anchor, 'to')) : null;
        const extEl = Array.from(anchor.children).find((c) => c.localName === 'ext') || first(anchor, 'ext');
        const ext = extEl ? { cx: Number(extEl.getAttribute('cx')), cy: Number(extEl.getAttribute('cy')) } : null;
        const posEl = anchor.localName === 'absoluteAnchor' ? first(anchor, 'pos') : null;
        const start = from || (posEl ? { col: 0, row: 0, colOff: Number(posEl.getAttribute('x')), rowOff: Number(posEl.getAttribute('y')) } : null);
        if (!start) continue;
        // A picture, or pictures grouped together: placed by the anchor.
        for (const pic of all(anchor, 'pic')) {
          const blip = first(pic, 'blip');
          const path = blip && images[rAttr(blip, 'embed')];
          const type = path && TYPES[path.split('.').pop().toLowerCase()];
          if (!type) continue;
          if (!media.has(path)) {
            const bytes = await zip.file(path)?.async('arraybuffer');
            if (!bytes) continue;
            media.set(path, URL.createObjectURL(new Blob([bytes], { type })));
          }
          const nameEl = first(pic, 'cNvPr');
          pics.push({ url: media.get(path), from: start, to, ext, name: nameEl?.getAttribute('descr') || nameEl?.getAttribute('name') || 'Picture' });
          if (to || ext) break; // grouped pictures share one box: show the first
        }
      }
    }
    if (pics.length) out[name] = pics;
  }
  return out;
}

/** Frees the object URLs made by readPictures. */
export function revokePictures(bySheet) {
  const seen = new Set();
  for (const list of Object.values(bySheet || {})) {
    for (const p of list) if (!seen.has(p.url)) { seen.add(p.url); URL.revokeObjectURL(p.url); }
  }
}
