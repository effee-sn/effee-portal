'use client';

import { useCallback, useRef, useState } from 'react';

/** Rows-per-page choices. The API caps a page at 100 (Backend core/http/queryOptions). */
export const PAGE_SIZES = Object.freeze([10, 20, 50, 100]);

/**
 * A list's rows-per-page, remembered in this browser per list.
 *
 * Returns the value for rendering, a setter, and a ref that always holds the
 * latest value — the list's fetch reads the ref, so a page-size change can
 * re-fetch straight away without waiting for a re-render.
 *
 * @param {string} key   one per list, e.g. 'sales-enquiries'
 * @param {number} fallback default size
 * @returns {[number, (n: number) => void, { current: number }]}
 */
export default function usePageSize(key, fallback = 10) {
  const storageKey = `pageSize:${key}`;
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return PAGE_SIZES.includes(v) ? v : fallback;
    } catch { return fallback; }
  });
  // Starts at the initial size; only `update` changes the size, and it sets
  // both, so the ref never lags.
  const ref = useRef(size);

  const update = useCallback((n) => {
    const v = PAGE_SIZES.includes(n) ? n : fallback;
    ref.current = v;
    setSize(v);
    try { localStorage.setItem(storageKey, String(v)); } catch { /* private mode */ }
  }, [storageKey, fallback]);

  return [size, update, ref];
}
