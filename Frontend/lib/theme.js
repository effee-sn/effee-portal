/**
 * Screen theme: LIGHT, DARK or SYSTEM (follow the device setting).
 *
 * The choice is saved on the user (PUT /auth/preferences) so it follows them
 * to any computer, and mirrored in localStorage so the inline script in
 * app/layout.js can apply it before the first paint — no white flash. The
 * page reads `<html data-theme="light|dark">`; app/globals.css does the rest.
 */

export const THEMES = Object.freeze(['LIGHT', 'DARK', 'SYSTEM']);
const KEY = 'theme';

/** Runs in <head> before React — keep it tiny and dependency-free. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=(localStorage.getItem('${KEY}')||'SYSTEM').toUpperCase();var d=p==='DARK'||(p==='SYSTEM'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

/** The saved preference in this browser. @returns {'LIGHT'|'DARK'|'SYSTEM'} */
export function storedTheme() {
  try {
    const v = (localStorage.getItem(KEY) || 'SYSTEM').toUpperCase();
    return THEMES.includes(v) ? v : 'SYSTEM';
  } catch { return 'SYSTEM'; }
}

const systemDark = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

let unwatch = null;

/**
 * Applies a preference now and remembers it in this browser. SYSTEM follows
 * the device live (switching Windows to dark turns the portal dark).
 * @param {'LIGHT'|'DARK'|'SYSTEM'} pref
 */
export function applyTheme(pref) {
  if (typeof document === 'undefined') return;
  const p = THEMES.includes(pref) ? pref : 'SYSTEM';
  try { localStorage.setItem(KEY, p); } catch { /* private mode: still applies */ }
  const set = () => {
    document.documentElement.dataset.theme = p === 'DARK' || (p === 'SYSTEM' && systemDark()) ? 'dark' : 'light';
  };
  set();
  unwatch?.();
  unwatch = null;
  if (p === 'SYSTEM' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', set);
    unwatch = () => mq.removeEventListener('change', set);
  }
}
