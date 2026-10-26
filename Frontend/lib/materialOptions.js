/** Shared labels for the material master. */

export const MATERIAL_TYPES = Object.freeze([
  { value: 'FINISHED', label: 'Finished' },
  { value: 'BOUGHT_OUT', label: 'Bought-out' },
  { value: 'CONSUMABLE', label: 'Consumables' },
]);

export const MATERIAL_TYPE_LABEL = Object.freeze(Object.fromEntries(MATERIAL_TYPES.map((t) => [t.value, t.label])));

/** prefix + separator + zero-padded number — mirrors the server's formatCode. */
export const formatImmCode = (p, n) => `${p.prefix}${p.separator || ''}${String(n).padStart(p.digits, '0')}`;

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
