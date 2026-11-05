'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

/**
 * Material types (Administrator → Configuration → Material Types), loaded once
 * per page and shared. A material carries its type's code (`material_type`)
 * and, from the API, the type itself (`type`: name and what it decides);
 * locked BOM tags carry only the code — names come from here.
 */

let cache = null; // Promise of the list, shared by every component on the page

/** Loads (or reloads, after a change in Configuration) the list. */
export function loadMaterialTypes(force = false) {
  if (!cache || force) {
    cache = apiGet('/materials/types', { silent: true }).then((r) => r.data || []).catch(() => { cache = null; return []; });
  }
  return cache;
}

/**
 * @returns {{ types: object[], choosable: object[], nameOf: (code: string) => string, byCode: Map<string, object> }}
 *   types: all (incl. inactive and the built-in Subassembly); choosable: active, not built in — for new materials
 */
export default function useMaterialTypes() {
  const [types, setTypes] = useState([]);
  useEffect(() => {
    let alive = true;
    loadMaterialTypes().then((list) => { if (alive) setTypes(list); });
    return () => { alive = false; };
  }, []);
  const byCode = new Map(types.map((t) => [t.code, t]));
  return {
    types,
    choosable: types.filter((t) => t.is_active && !t.is_system),
    byCode,
    nameOf: (code) => byCode.get(code)?.name ?? code ?? '',
  };
}

/** A type's name from its code (e.g. on locked BOM tags, which store the code). */
export function TypeName({ code }) {
  const { nameOf } = useMaterialTypes();
  return code ? nameOf(code) : '—';
}

/** A type typed in a file or pasted ("Bought-out", "bought out", "BO", its code …) → its code; '' when not recognised. */
export function typeFromText(text, types) {
  const norm = (v) => String(v || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const s = norm(text);
  if (!s) return '';
  const usable = types.filter((t) => !t.is_system);
  const exact = usable.find((t) => norm(t.name) === s || norm(t.code) === s);
  if (exact) return exact.code;
  // Old short forms: "BO" for Bought-out, "Fin", "Con" …
  const starts = usable.filter((t) => norm(t.name).startsWith(s) || s.startsWith(norm(t.name)));
  if (starts.length === 1) return starts[0].code;
  if (s === 'bo') return usable.find((t) => t.code === 'BOUGHT_OUT')?.code ?? '';
  return '';
}
