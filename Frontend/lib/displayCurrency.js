'use client';

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import useCurrencies, { formatMoney } from './money';
import { compactINR } from '@/components/DashboardKit';

/**
 * The currency money is shown in, portal-wide — chosen once in the top navbar
 * and followed by every page that shows Sales money (home dashboard, Sales
 * dashboard, enquiry list and Kanban, an enquiry's "≈" values). Reports and
 * their exports stay in ₹.
 *
 * The server does the conversion (`currency` / `display_currency` on the
 * request; see Backend master/fx.js → displayConverter): an open amount at the
 * currency's rate today, a won order or a sent offer at its rate on the day it
 * was won / sent — so past figures keep the value they had then. Display only:
 * nothing stored changes. Remembered per browser; INR until one is picked.
 */

const KEY = 'display-currency';
const EVENT = 'display-currency-change';

// v1.6.0 first kept the choice under the Sales pages' own key.
const read = () => {
  try { return window.localStorage.getItem(KEY) || window.localStorage.getItem('sales-display-currency') || 'INR'; }
  catch { return 'INR'; }
};
// Every open page (and other tabs) hears a change the moment it is made.
const subscribe = (cb) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb); };
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
 * The navbar's currency, the active currencies to choose from, and formatters
 * for amounts the server returned in a given currency.
 * @returns {{ code: string, list: Array<object>, setCode: (code: string) => void, formatterFor: (code: string) => ReturnType<typeof formatterFor> }}
 */
export function useDisplayCurrency() {
  const currencies = useCurrencies();
  const picked = useSyncExternalStore(subscribe, read, () => 'INR');
  const list = useMemo(() => currencies?.list || [], [currencies]);
  // A currency since made inactive (or not loaded yet) falls back to INR.
  const code = list.some((c) => c.code === picked) ? picked : 'INR';

  return useMemo(() => ({
    code,
    list,
    setCode: (next) => {
      try { window.localStorage.setItem(KEY, next); } catch { /* not remembered in private mode */ }
      window.dispatchEvent(new Event(EVENT));
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

/**
 * The currency switch (active currencies) — sits in the top navbar.
 * @param {{ money: ReturnType<typeof useDisplayCurrency>, navbar?: boolean }} props
 */
export function CurrencySelect({ money, navbar = false }) {
  if (!money.list.length) return null;
  const cls = navbar
    ? 'h-8 text-xs font-medium rounded-full px-2.5 bg-white/10 text-white border border-white/20 hover:bg-white/20 outline-none cursor-pointer'
    : 'shrink-0 text-sm border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white cursor-pointer';
  return (
    <select value={money.code} onChange={(e) => money.setCode(e.target.value)} aria-label="Show money in"
      title="Show money in this currency — open enquiries at today’s rate, won orders and sent offers at the rate of their day"
      className={cls}>
      {money.list.map((c) => <option key={c.code} value={c.code} className="text-gray-800">{c.code}{c.symbol ? ` ${c.symbol}` : ''}</option>)}
    </select>
  );
}
