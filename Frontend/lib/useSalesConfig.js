'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

/**
 * Sales configuration (applications + stage probabilities) for the enquiry
 * screens. Fetched once and shared across pages for a short while, so moving
 * between the list, a record and the create form doesn't refetch it. The
 * Configuration page calls `invalidateSalesConfig()` after a change.
 *
 * Shape: { applications: Array<{ id, name, is_active, … }>, probability: { STAGE: percent } }
 */

const TTL_MS = 60 * 1000;
let cache = null; // { at: number, promise: Promise }

export function loadSalesConfig() {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const promise = Promise.all([apiGet('/sales/applications'), apiGet('/sales/stage-probabilities')])
      .then(([apps, probs]) => ({
        applications: apps.data,
        probability: Object.fromEntries(probs.data.map((p) => [p.stage, p.probability])),
      }))
      .catch((err) => { cache = null; throw err; });
    cache = { at: Date.now(), promise };
  }
  return cache.promise;
}

export function invalidateSalesConfig() {
  cache = null;
}

/** @returns {{ applications: object[], probability: Record<string, number> } | null} null while loading */
export default function useSalesConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadSalesConfig().then((c) => { if (!cancelled) setConfig(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return config;
}
