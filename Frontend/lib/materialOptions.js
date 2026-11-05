/** Shared helpers for the material master. Material types are configurable: see lib/materialTypes. */
import { typeFromText } from '@/lib/materialTypes';

/**
 * A drawing revision as read: "Rev A", "Rev 01" — the first release reads as
 * its own name ("Original"). Mirrors the server's revName.
 */
export const revName = (rev) => {
  if (rev === null || rev === undefined || rev === '') return '';
  return /^([A-Z]{1,3}|\d+)$/.test(String(rev)) ? `Rev ${rev}` : String(rev);
};

/** prefix + separator + zero-padded number — mirrors the server's formatCode. */
export const formatImmCode = (p, n) => `${p.prefix}${p.separator || ''}${String(n).padStart(p.digits, '0')}`;

/**
 * The prefix an existing IMM code is in, and its number — the code must read
 * exactly as that prefix writes it. Mirrors the server's prefixForCode.
 * @returns {{ prefix: object, number: number } | null}
 */
export function prefixForCode(code, prefixes) {
  const c = String(code || '').trim().toUpperCase();
  for (const p of [...prefixes].sort((a, b) => b.prefix.length - a.prefix.length)) {
    const head = `${p.prefix}${p.separator || ''}`;
    const rest = c.startsWith(head) ? c.slice(head.length) : '';
    const n = /^\d+$/.test(rest) ? Number(rest) : 0;
    if (n > 0 && formatImmCode(p, n) === c) return { prefix: p, number: n };
  }
  return null;
}

/**
 * One row of an Excel import (as the server read it) → a material row, with
 * the prefix (from its kept IMM code, else its prefix column), unit and type
 * matched. A code is kept only for those allowed; '' ids mean "not matched".
 * @param {object} x  { row, imm_code, prefix, drawing_no, item_name, … }
 * @param {{ prefixes: object[], units: object[], types: object[], canKeepCodes: boolean }} ctx  active prefixes, all units, all material types
 * @returns {{ row: object, notes: string[] }}
 */
export function fromImportRow(x, { prefixes, units, types = [], canKeepCodes }) {
  const notes = [];
  const imm_code = canKeepCodes ? String(x.imm_code || '').trim().toUpperCase() : '';
  const kept = imm_code ? prefixForCode(imm_code, prefixes)?.prefix : null;
  const p = kept || (x.prefix ? prefixes.find((a) => a.prefix.toLowerCase() === String(x.prefix).toLowerCase()) : null);
  // No type in the file: the prefix's type, if it has one.
  const material_type = typeFromText(x.material_type, types) || (!x.material_type && p?.type_code) || '';
  const uom_id = unitFromText(x.unit, units);
  if (x.prefix && !p && !imm_code) notes.push(`prefix "${x.prefix}" not found or inactive`);
  if (x.material_type && !material_type) notes.push(`material type "${x.material_type}" not recognised`);
  if (x.unit && !uom_id) notes.push(`unit "${x.unit}" not found or inactive`);
  return {
    row: {
      imm_code, prefix_id: p ? String(p.id) : '', uom_id, material_type,
      drawing_no: x.drawing_no || '', item_name: x.item_name || '', description: x.description || '',
      technical_spec: x.technical_spec || '', material: x.material || '', remarks: x.remarks || '',
    },
    notes,
  };
}

/** sessionStorage key: an Excel file read by Import on the list, picked up by the New page's grid. */
export const IMPORT_HANDOFF = 'materials-import';

/**
 * A unit typed or pasted as text ("kg", "Kilogram", "NOS") → that active
 * unit's id as a string, or '' when none matches.
 * @param {string} text @param {Array<{ id: number, code: string, name: string, is_active: boolean }>} units
 */
export function unitFromText(text, units) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return '';
  const u = units.find((x) => x.is_active && (x.code.toLowerCase() === s || x.name.toLowerCase() === s));
  return u ? String(u.id) : '';
}
