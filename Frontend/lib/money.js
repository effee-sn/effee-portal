'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

/**
 * Money display + the currency list (Master Data → Currencies).
 *
 * Amounts live in their record's currency; totals are in INR (the base). Show
 * a foreign amount as "$50,000.00" with its rupee value beside it.
 */

/**
 * Formats an amount in a currency: "$50,000.00", "₹4,20,000.00".
 * Uses Indian digit grouping throughout, and the master's symbol when given.
 * @param {unknown} value
 * @param {string} [code] 3-letter currency code (default INR)
 * @param {string} [symbol] symbol from the currency master
 */
export function formatMoney(value, code = 'INR', symbol) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  const digits = n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (symbol) return `${symbol}${digits}`;
  try {
    return n.toLocaleString('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 2 });
  } catch {
    return `${code} ${digits}`; // a code Intl doesn't know
  }
}

const TTL_MS = 60 * 1000;
let cache = null; // { at, promise }

/** Active currencies with current rates; the default one is flagged. */
export function loadCurrencies() {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const promise = apiGet('/currencies/options')
      .then((res) => res.data)
      .catch((err) => { cache = null; throw err; });
    cache = { at: Date.now(), promise };
  }
  return cache.promise;
}

/** Called by the Currencies master after a change. */
export function invalidateCurrencies() {
  cache = null;
}

/**
 * @returns {{ list: Array<{ code, name, symbol, rate, is_default, is_base }>, byCode: Record<string, object>, defaultCode: string } | null}
 */
export default function useCurrencies() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadCurrencies()
      .then((list) => {
        if (cancelled) return;
        setState({
          list,
          byCode: Object.fromEntries(list.map((c) => [c.code, c])),
          defaultCode: list.find((c) => c.is_default)?.code || 'INR',
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return state;
}

/**
 * An amount in its own currency, followed by its rupee value when it isn't INR:
 * "$50,000.00 (≈ ₹42,00,000.00)".
 * @param {{ value: unknown, inr?: unknown, code?: string, symbol?: string, className?: string }} props
 */
export function MoneyText({ value, inr, code = 'INR', symbol, className = '' }) {
  if (value === null || value === undefined || value === '') return <span className={className}>—</span>;
  const foreign = code !== 'INR';
  return (
    <span className={className}>
      {formatMoney(value, code, symbol)}
      {foreign && inr !== null && inr !== undefined && (
        <span className="text-gray-500 font-normal"> (≈ {formatMoney(inr, 'INR')})</span>
      )}
    </span>
  );
}
