const XLSX = require('xlsx');

/**
 * Turns a built report into a downloadable file.
 *
 *   - Excel (.xlsx): a header block (company, report, filters, generated at),
 *     then the table and a totals row. Numbers stay numbers and dates stay
 *     dates, with Excel number formats per column type.
 *   - CSV: the table and totals only (clean for importing elsewhere), UTF-8
 *     with a BOM so Excel shows ₹ and other symbols correctly.
 */

const FORMATS = {
  inr: '#,##0.00',
  amount: '#,##0.00',
  rate: '0.0000',
  pct: '0.0',
  int: '0',
};

/** 'YYYY-MM-DD' → local Date (Excel shows it as a real date). */
const toDate = (v) => {
  if (!v) return null;
  const [y, m, d] = String(v).split('-').map(Number);
  return new Date(y, m - 1, d);
};

function cellValue(col, value) {
  if (value === null || value === undefined || value === '') return null;
  if (col.type === 'date') return toDate(value);
  if (FORMATS[col.type]) return Number(value);
  return String(value);
}

/**
 * @param {{ title: string, columns: object[], rows: object[], totals?: object, notes?: string[] }} report
 * @param {{ company: string, filters: string, generatedAt: string }} meta
 * @returns {Buffer}
 */
function toXlsx(report, meta) {
  const { columns, rows, totals } = report;
  const head = [
    [meta.company || ''],
    [report.title],
    [meta.filters],
    [`Generated ${meta.generatedAt}`],
    [],
  ];
  const headerRow = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => cellValue(c, r[c.key])));
  const totalRow = totals ? columns.map((c) => cellValue(c, totals[c.key])) : null;
  const notes = (report.notes || []).map((n) => [n]);

  const aoa = [...head, headerRow, ...body, ...(totalRow ? [totalRow] : []), ...(notes.length ? [[], ...notes] : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'dd-mmm-yyyy' });

  // Number / date formats per column, for the data and totals rows.
  const firstDataRow = head.length + 1; // 0-based row index of the first data row
  const lastRow = firstDataRow + body.length + (totalRow ? 1 : 0) - 1;
  columns.forEach((c, ci) => {
    const fmt = c.type === 'date' ? 'dd-mmm-yyyy' : FORMATS[c.type];
    if (!fmt) return;
    for (let ri = firstDataRow; ri <= lastRow; ri += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
      if (cell) cell.z = fmt;
    }
  });

  // Column widths from the longest value in each column (capped).
  ws['!cols'] = columns.map((c, ci) => {
    const longest = Math.max(
      c.label.length,
      ...body.map((r) => (r[ci] instanceof Date ? 11 : String(r[ci] ?? '').length)),
      totalRow ? String(totalRow[ci] ?? '').length : 0,
    );
    return { wch: Math.min(48, Math.max(8, longest + 2)) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, report.title.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
}

/** RFC 4180 field quoting. */
const csvField = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * @param {{ columns: object[], rows: object[], totals?: object }} report
 * @returns {Buffer}
 */
function toCsv(report) {
  const { columns, rows, totals } = report;
  const lines = [columns.map((c) => csvField(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvField(r[c.key])).join(','));
  if (totals) lines.push(columns.map((c) => csvField(totals[c.key])).join(','));
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

module.exports = { toXlsx, toCsv };
