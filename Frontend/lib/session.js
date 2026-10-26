/**
 * The signed-in session (a JWT kept in localStorage): when it runs out, and
 * ending it. A session that has expired — or that the server no longer
 * accepts (401) — ends here: the token is cleared and the browser goes to the
 * login page, which says why.
 */

const TOKEN_KEY = 'token';
let ending = false;

/** The stored token, or null. */
export function getToken() {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null; }
  catch { return null; }
}

/**
 * When a token expires, in ms since the epoch (from its `exp` claim), or null
 * when it can't be read (the server still checks it on every request).
 * @param {string|null} token
 */
export function tokenExpiry(token) {
  try {
    const part = String(token).split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch { return null; }
}

/** True when the stored token's time is up. */
export function isExpired(token = getToken()) {
  const exp = tokenExpiry(token);
  return exp !== null && Date.now() >= exp;
}

/**
 * Ends the session: clears the token and opens the login page (a full load,
 * so nothing of the old session stays in memory). Runs once, however many
 * requests fail together.
 * @param {'expired'|'signed-out'} [reason]
 */
export function endSession(reason = 'expired') {
  if (typeof window === 'undefined' || ending) return;
  ending = true;
  try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* nothing to clear */ }
  if (window.location.pathname.startsWith('/login')) { ending = false; return; }
  window.location.assign(reason === 'expired' ? '/login?expired=1' : '/login');
}
