/**
 * The world's currencies (ISO 4217) with English names and symbols, taken from
 * the browser's built-in Intl data rather than a hand-kept list — so it stays
 * current without maintenance. Used to pick a currency in Master Data →
 * Currencies instead of typing code / name / symbol by hand.
 */

// Used only if the browser can't enumerate currencies (very old browsers).
const FALLBACK = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'JPY', 'CNY', 'SGD', 'AUD', 'CAD', 'CHF', 'KRW', 'THB', 'MYR'];

// X-codes are mostly precious metals / funds / test codes; keep the real
// currencies among them.
const KEEP_X = new Set(['XAF', 'XOF', 'XCD', 'XPF']);

function symbolOf(code) {
  try {
    const part = new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value || code;
  } catch {
    return code;
  }
}

let cached = null;

/** @returns {Array<{ code: string, name: string, symbol: string }>} sorted by code */
export function isoCurrencies() {
  if (cached) return cached;
  let codes;
  try {
    codes = Intl.supportedValuesOf('currency');
  } catch {
    codes = FALLBACK;
  }
  let names = null;
  try { names = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch { /* names fall back to the code */ }
  cached = codes
    .filter((c) => /^[A-Z]{3}$/.test(c) && (!c.startsWith('X') || KEEP_X.has(c)))
    .map((code) => ({ code, name: names?.of(code) || code, symbol: symbolOf(code) }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return cached;
}
