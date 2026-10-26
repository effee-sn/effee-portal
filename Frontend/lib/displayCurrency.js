'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import useCurrencies, { formatMoney } from './money';
import { compactINR } from '@/components/DashboardKit';

/**
 * The currency Sales amounts are shown in (Sales → Dashboard and Enquiries).
 *
 * The server does the conversion (`currency` / `display_currency` on the
 * request; see Backend master/fx.js → displayConverter): an open amount at the
 * currency's rate today, a won order or a sent offer at its rate on the day it
 * was won / sent — so past figures keep the value they had then. Display only:
 * nothing stored changes. The choice is shared by those pages and remembered
 * per browser; INR until one is picked.
 */

const KEY = 'sales-display-currency';
const saved = () => {
  try { return (typeof window !== 'undefined' && window.localStorage.getItem(KEY)) || 'INR'; }
  catch { return 'INR'; }
};

/** Compact amount in a foreign currency for tiles: $1.2M, €850K. */
function compactForeign(n, symbol, code) {
  const s = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return symbol ? `${symbol}${s}` : `${code} ${s}`;
}

/**
 * Formatters for amounts already in a currency.
 * @param {string} code @param {string} [symbol]
 */
export function formatterFor(code = 'INR', symbol) {
  const isInr = code === 'INR';
  const blank = (v) => v === null || v === undefined || v === '' || Number.isNaN(Number(v));
  return {
    code,
    format: (v) => (blank(v) ? '—' : formatMoney(Number(v), code, isInr ? '₹' : symbol)),
    compact: (v) => (blank(v) ? '—' : isInr ? compactINR(Number(v)) : compactForeign(Number(v), symbol, code)),
  };
}

/**
 * The chosen currency, the active currencies to choose from, and formatters
 * for amounts the server returned in a given currency.
 * @returns {{ code: string, list: Array<object>, setCode: (code: string) => void, formatterFor: (code: string) => ReturnType<typeof formatterFor> }}
 */
export function useDisplayCurrency() {
  const currencies = useCurrencies();
  const [picked, setPicked] = useState(saved);
  const list = useMemo(() => currencies?.list || [], [currencies]);
  // A currency since made inactive (or not loaded yet) falls back to INR.
  const code = list.some((c) => c.code === picked) ? picked : 'INR';

  return useMemo(() => ({
    code,
    list,
    setCode: (next) => {
      setPicked(next);
      try { window.localStorage.setItem(KEY, next); } catch { /* not remembered in private mode */ }
    },
    formatterFor: (c) => formatterFor(c || 'INR', list.find((x) => x.code === c)?.symbol),
  }), [code, list]);
}

/** Lets the charts and rows inside a page format amounts in the page's currency. */
export const DisplayCurrencyContext = createContext(null);

/** The page's formatters (INR when used outside a page that chose a currency). */
export function useMoney() {
  return useContext(DisplayCurrencyContext) || formatterFor('INR');
}

/** The currency dropdown (active currencies). @param {{ money: ReturnType<typeof useDisplayCurrency> }} props */
export function CurrencySelect({ money }) {
  if (!money.list.length) return null;
  return (
    <select value={money.code} onChange={(e) => money.setCode(e.target.value)} aria-label="Show amounts in"
      title="Show amounts in this currency — open enquiries at today’s rate, won orders and sent offers at the rate of their day"
      className="shrink-0 text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer">
      {money.list.map((c) => <option key={c.code} value={c.code}>{c.code}{c.symbol ? ` (${c.symbol})` : ''}</option>)}
    </select>
  );
}
