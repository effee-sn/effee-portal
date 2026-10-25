/** Shared labels for the material master. */

export const MATERIAL_TYPES = Object.freeze([
  { value: 'FINISHED', label: 'Finished' },
  { value: 'BOUGHT_OUT', label: 'Bought-out' },
  { value: 'CONSUMABLE', label: 'Consumables' },
]);

export const MATERIAL_TYPE_LABEL = Object.freeze(Object.fromEntries(MATERIAL_TYPES.map((t) => [t.value, t.label])));

/** prefix + separator + zero-padded number — mirrors the server's formatCode. */
export const formatImmCode = (p, n) => `${p.prefix}${p.separator || ''}${String(n).padStart(p.digits, '0')}`;
