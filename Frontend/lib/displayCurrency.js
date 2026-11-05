'use client';

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import useCurrencies, { formatMoney, shortMoney } from './money';

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

/*
 * Short or full amounts — the switch at the top right of the dashboards.
 * "Short" reads ₹33.79 Crore / €3.82 Million; "Full" shows the exact figure
 * (₹33,79,12,345.00, €3,820,000.00) in every currency's own grouping, so totals
 * can be checked to the rupee. Remembered per browser; short until changed.
 */
const STYLE_KEY = 'amount-style';
const STYLE_EVENT = 'amount-style-change';
const readStyle = () => {
  try { return window.localStorage.getItem(STYLE_KEY) === 'full' ? 'full' : 'short'; }
  catch { return 'short'; }
};
const subscribeStyle = (cb) => {
  window.addEventListener(STYLE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(STYLE_EVENT, cb); window.removeEventListener('storage', cb); };
};

/**
 * Formatters for amounts already in a currency: `format` the full figure,
 * `compact` the short one in words (₹38.18 Lakh, €3.82 Million) — or, with the
 * amount style "full", the full figure too.
 * @param {string} code @param {string} [symbol] @param {'short'|'full'} [style]
 */
export function formatterFor(code = 'INR', symbol, style = 'short') {
  const isInr = code === 'INR';
  const blank = (v) => v === null || v === undefined || v === '' || Number.isNaN(Number(v));
  const format = (v) => (blank(v) ? '—' : formatMoney(Number(v), code, isInr ? '₹' : symbol));
  return {
    code,
    style,
    format,
    compact: style === 'full' ? format : (v) => (blank(v) ? '—' : shortMoney(Number(v), code, isInr ? '₹' : symbol)),
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
  const style = useSyncExternalStore(subscribeStyle, readStyle, () => 'short');
  const list = useMemo(() => currencies?.list || [], [currencies]);
  // A currency since made inactive (or not loaded yet) falls back to INR.
  const code = list.some((c) => c.code === picked) ? picked : 'INR';

  return useMemo(() => ({
    code,
    list,
    style,
    setCode: (next) => {
      try { window.localStorage.setItem(KEY, next); } catch { /* not remembered in private mode */ }
      window.dispatchEvent(new Event(EVENT));
    },
    setStyle: (next) => {
      try { window.localStorage.setItem(STYLE_KEY, next === 'full' ? 'full' : 'short'); } catch { /* not remembered in private mode */ }
      window.dispatchEvent(new Event(STYLE_EVENT));
    },
    formatterFor: (c) => formatterFor(c || 'INR', list.find((x) => x.code === c)?.symbol, style),
  }), [code, list, style]);
}

/**
 * Short / Full amounts switch (top right of the dashboards). Every short
 * amount that follows the display currency follows it too — dashboards, the
 * enquiry list and Kanban.
 * @param {{ money: ReturnType<typeof useDisplayCurrency> }} props
 */
export function AmountStyleSwitch({ money }) {
  const opt = (value, label, hint) => (
    <button type="button" onClick={() => money.setStyle(value)} aria-pressed={money.style === value} title={hint}
      className={`px-2.5 py-1 text-xs font-medium cursor-pointer ${money.style === value
        ? 'bg-[var(--ams-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Amounts" className="inline-flex shrink-0 rounded border border-gray-300 overflow-hidden">
      {opt('short', 'Short', 'Amounts in words: ₹33.79 Crore, €3.82 Million')}
      {opt('full', 'Full', 'Exact amounts: ₹33,79,12,345.00 — in each currency’s own grouping')}
    </div>
  );
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
