const XLSX = require('xlsx');
const { ValidationError } = require('../../core');

/**
 * Materials from an Excel file — read only, nothing is saved here. The rows go
 * back to the bulk entry grid, where they are checked and saved like typed ones.
 *
 * Columns are found by their heading (any order, case and extra spaces
 * ignored), so the template, the list's Excel export and most hand-made
 * sheets read alike. Unknown columns (an export's Status) are skipped. IMM
 * code, prefix, material type and unit stay text: the grid matches them (an
 * IMM code is kept only for those allowed; others get the next number).
 */

const COLUMNS = Object.freeze([
  { key: 'imm_code', head: 'IMM code', also: ['imm no', 'imm no.', 'item code', 'material code', 'code'] },
  { key: 'prefix', head: 'IMM code prefix', also: ['prefix', 'code prefix'] },
  { key: 'drawing_no', head: 'Drawing no.', also: ['drawing no', 'drawing number', 'drawing', 'dwg no', 'dwg no.'] },
  { key: 'item_name', head: 'Item name', also: ['item', 'name'] },
  { key: 'description', head: 'Description', also: [] },
  { key: 'technical_spec', head: 'Technical specification', also: ['technical spec', 'specification', 'spec'] },
  { key: 'material_type', head: 'Material type', also: ['type'] },
  { key: 'material', head: 'Material', also: ['moc'] },
  { key: 'unit', head: 'Unit', also: ['uom', 'unit of measure'] },
  { key: 'remarks', head: 'Remarks', also: ['remark', 'notes'] },
]);
const MAX_ROWS = 200; // the bulk save's limit
const HEADER_SCAN = 10; // the heading row must be among the first rows

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const HEAD_TO_KEY = new Map(COLUMNS.flatMap((c) => [c.head, ...c.also].map((h) => [norm(h), c.key])));

/**
 * @param {Buffer} buffer  an .xlsx / .xls / .csv file
 * @returns {{ sheet: string, rows: Array<{ row: number } & Record<string, string>>, skipped_columns: string[] }}
 */
function readMaterialsFile(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellHTML: false, cellFormula: false });
  } catch {
    throw new ValidationError('That file could not be read — save it as .xlsx and try again');
  }
  const sheet = wb.SheetNames[0];
  const grid = sheet ? XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: false, defval: '', blankrows: true }) : [];

  const headAt = grid.slice(0, HEADER_SCAN).findIndex((r) => r.some((c) => HEAD_TO_KEY.get(norm(c)) === 'item_name'));
  if (headAt < 0) {
    throw new ValidationError(`No "Item name" heading found in the first ${HEADER_SCAN} rows of sheet "${sheet || '—'}" — download the template for the headings`);
  }
  const keyAt = new Map(); // column index → field
  const skipped = [];
  grid[headAt].forEach((c, ci) => {
    const k = HEAD_TO_KEY.get(norm(c));
    if (k && ![...keyAt.values()].includes(k)) keyAt.set(ci, k);
    else if (String(c).trim()) skipped.push(String(c).trim());
  });

  const rows = [];
  grid.slice(headAt + 1).forEach((r, i) => {
    const item = { row: headAt + i + 2 }; // Excel's row number
    keyAt.forEach((k, ci) => { item[k] = String(r[ci] ?? '').trim(); });
    if (COLUMNS.some((c) => !['imm_code', 'prefix', 'unit'].includes(c.key) && item[c.key])) rows.push(item);
  });
  if (!rows.length) throw new ValidationError('No materials found under the headings');
  if (rows.length > MAX_ROWS) throw new ValidationError(`The file has ${rows.length} materials — at most ${MAX_ROWS} at a time; split it into smaller files`);
  return { sheet, rows, skipped_columns: skipped };
}

/**
 * The template: the headings in the bulk entry's order, one example row, and
 * a sheet listing the prefixes, material types and units it accepts.
 * @param {{ prefixes: Array<{ prefix: string, description?: string|null }>, units: Array<{ code: string, name: string }> }} lists  active ones
 */
function materialsTemplate({ prefixes, units, types = [] }) {
  const head = COLUMNS.map((c) => c.head);
  const example = ['', prefixes[0]?.prefix || '', 'DRG-1001', 'Coil support bracket', 'Bracket holding the coil', '6 mm plate, 2 holes Ø12', types[0]?.name || 'Finished', 'MS', units[0]?.code || 'Nos', 'Example row — delete it'];
  const ws = XLSX.utils.aoa_to_sheet([head, example]);
  ws['!cols'] = head.map((h) => ({ wch: Math.max(14, h.length + 4) }));

  const lists = [['IMM code prefix', 'About', '', 'Material type', '', 'Unit', 'Name']];
  const n = Math.max(prefixes.length, types.length, units.length);
  for (let i = 0; i < n; i += 1) {
    lists.push([prefixes[i]?.prefix || '', prefixes[i]?.description || '', '', types[i]?.name || '', '', units[i]?.code || '', units[i]?.name || '']);
  }
  const help = XLSX.utils.aoa_to_sheet([
    ['Fill the Materials sheet, one material per row; keep the headings. Required: Item name, Description, Technical specification, Material type, Material, Unit, and a prefix (here or chosen on screen).'],
    ['Drawing no. is optional and must not be one another material already has. Remarks are optional. At most 200 rows per file.'],
    ['IMM code: leave empty to get the prefix\'s next number. To keep an existing code (Super Admin or whoever edits the prefixes only), write it in the prefix\'s format, e.g. IMM-00457; the prefix then continues after the highest code kept.'],
    [],
    ...lists,
  ]);
  help['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 2 }, { wch: 16 }, { wch: 2 }, { wch: 10 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Materials');
  XLSX.utils.book_append_sheet(wb, help, 'Accepted values');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { readMaterialsFile, materialsTemplate, MAX_ROWS };
