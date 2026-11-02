const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { readMaterialsFile, materialsTemplate } = require('../../src/modules/master/material.import');

const book = (aoa, type = 'xlsx') => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: type });
};

test('columns are found by heading, in any order; unknown ones are skipped', () => {
  const out = readMaterialsFile(book([
    ['A title row above the headings'],
    ['IMM code', '  item NAME ', 'Unit', 'Description', 'Spec', 'Type', 'Material', 'Drawing No', 'Status'],
    ['IMM-00001', 'Bracket', 'Nos', 'Holds coil', '6 mm', 'Finished', 'MS', 'D-1', 'Active'],
    ['', '', '', '', '', '', '', '', ''],
    ['', 'Bolt', 'nos', 'M12', 'Gr 8.8', 'BO', 'SS', '', ''],
  ]));
  assert.deepEqual(out.skipped_columns, ['Status']);
  assert.equal(out.rows.length, 2);
  assert.deepEqual(out.rows[0], {
    row: 3, imm_code: 'IMM-00001', item_name: 'Bracket', unit: 'Nos', description: 'Holds coil', technical_spec: '6 mm',
    material_type: 'Finished', material: 'MS', drawing_no: 'D-1',
  });
  assert.equal(out.rows[1].row, 5);
  assert.equal(out.rows[1].imm_code, '');
});

test('an existing IMM code is matched to the prefix that writes it exactly', () => {
  const { createMaterialService } = require('../../src/modules/master/material.service');
  const { prefixForCode } = createMaterialService({});
  const P = [
    { id: 1, prefix: 'IMM', separator: '-', digits: 5 },
    { id: 2, prefix: 'EI2', separator: '', digits: 3 },
    { id: 3, prefix: 'EI', separator: '', digits: 3 },
  ];
  assert.deepEqual(prefixForCode('imm-00457', P), { prefix: P[0], number: 457 });
  assert.deepEqual(prefixForCode('IMM-123456', P), { prefix: P[0], number: 123456 }); // past the padding
  assert.deepEqual(prefixForCode('EI2001', P), { prefix: P[1], number: 1 });
  assert.deepEqual(prefixForCode('EI045', P), { prefix: P[2], number: 45 });
  assert.equal(prefixForCode('IMM-457', P), null); // not zero-padded the prefix's way
  assert.equal(prefixForCode('IMM_00457', P), null);
  assert.equal(prefixForCode('IMM-00000', P), null);
  assert.equal(prefixForCode('XYZ-001', P), null);
});

test('a sheet without an Item name heading, or too many rows, is refused', () => {
  assert.throws(() => readMaterialsFile(book([['a', 'b'], ['1', '2']])), /No "Item name" heading/);
  const many = [['Item name'], ...Array.from({ length: 201 }, (_, i) => [`x${i}`])];
  assert.throws(() => readMaterialsFile(book(many)), /at most 200/);
  assert.throws(() => readMaterialsFile(book([['Item name']])), /No materials found/);
});

test('csv reads too, and the template reads back to its example row', () => {
  assert.equal(readMaterialsFile(Buffer.from('Item name,Material\nPlate,MS\n')).rows[0].material, 'MS');
  const t = readMaterialsFile(materialsTemplate({ prefixes: [{ prefix: 'IMM' }], units: [{ code: 'Nos', name: 'Numbers' }] }));
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0].prefix, 'IMM');
  assert.equal(t.rows[0].unit, 'Nos');
  assert.deepEqual(t.skipped_columns, []);
});
