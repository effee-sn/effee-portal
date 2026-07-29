const { settingsService } = require('../modules/settings/settings.service');

/**
 * Fixed-window rate limiting for authentication endpoints.
 *
 * KNOWN LIMITATION — the counter lives in this process's memory. It is reset by
 * a restart and is not shared between instances, so it protects a single-node
 * deployment only. Moving to Redis is the correct fix before running more than
 * one backend instance; the exported interface here is deliberately shaped so
 * that swap requires no changes at the call sites.
 *
 * Accuracy of `req.ip` depends on `trust proxy` being configured to match the
 * real deployment topology — see TRUST_PROXY_HOPS in config/env.js. Behind an
 * unconfigured proxy every request appears to originate from the proxy itself,
 * which would let one client exhaust the shared budget for everyone.
 */

/** @type {Map<string, { count: number, resetAt: number }>} */
const store = new Map();

/** Milliseconds between sweeps of expired buckets. */
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Applies one request against a named bucket.
 *
 * @param {string} key Fully-qualified bucket key, namespaced by caller.
 * @param {number} max Requests permitted per window.
 * @param {number} windowMs Window length in milliseconds.
 * @returns {{ limited: boolean, retryAfterSecs: number }}
 */
function consume(key, max, windowMs) {
  const now   = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSecs: 0 };
  }

  entry.count += 1;

  if (entry.count > max) {
    return { limited: true, retryAfterSecs: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { limited: false, retryAfterSecs: 0 };
}

/**
 * Writes the 429 response for a limited request.
 *
 * @param {import('express').Response} res
 * @param {number} retryAfterSecs
 */
function rejectLimited(res, retryAfterSecs) {
  res.setHeader('Retry-After', String(retryAfterSecs));
  return res.status(429).json({
    message: `Too many attempts. Please try again in ${Math.ceil(retryAfterSecs / 60)} minute(s).`,
    retry_after: retryAfterSecs,
  });
}

/**
 * Builds a rate-limiting middleware with a static budget.
 *
 * @param {object} options
 * @param {string} options.name Bucket namespace, keeps unrelated limits separate.
 * @param {number} options.max Requests permitted per window.
 * @param {number} options.windowMs Window length in milliseconds.
 * @param {(req: import('express').Request) => string[]} [options.keys]
 *   Derives one or more bucket keys from the request. Every returned key is
 *   consumed, and the request is rejected if any is exhausted — this allows
 *   layering a per-IP budget with a per-target budget. Defaults to the client IP.
 * @returns {import('express').RequestHandler}
 */
function createRateLimiter({ name, max, windowMs, keys }) {
  const deriveKeys = keys || ((req) => [req.ip || 'unknown']);

  return (req, res, next) => {
    for (const rawKey of deriveKeys(req)) {
      if (!rawKey) continue;

      const { limited, retryAfterSecs } = consume(`${name}:${rawKey}`, max, windowMs);
      if (limited) return rejectLimited(res, retryAfterSecs);
    }

    return next();
  };
}

/**
 * Login limiter. Unlike the static limiters above, its budget is administrator-
 * configurable via CompanySettings, so it reads configuration per request.
 *
 * Fails open when the settings lookup throws: a database blip must not lock
 * every user out of the product. The trade-off is accepted deliberately —
 * credential stuffing during a database outage is the lesser risk, because a
 * downed database also means login itself cannot succeed.
 *
 * @type {import('express').RequestHandler}
 */
async function loginRateLimiter(req, res, next) {
  try {
    const { maxAttempts, windowMs } = await settingsService.getRateLimitConfig();

    const { limited, retryAfterSecs } = consume(`login:${req.ip || 'unknown'}`, maxAttempts, windowMs);
    if (limited) return rejectLimited(res, retryAfterSecs);

    return next();
  } catch {
    return next();
  }
}

/**
 * Clears a client's login budget after a successful authentication, so a user
 * who mistypes a few times is not penalised once they get it right.
 *
 * @param {string} ip
 */
function resetLoginAttempts(ip) {
  store.delete(`login:${ip}`);
}

/**
 * Limits password-reset requests.
 *
 * Two budgets are enforced together:
 *   - per IP    → stops one client enumerating many accounts.
 *   - per email → stops an attacker flooding a specific victim's inbox, which
 *                 an IP-only limit cannot prevent from a distributed source.
 *
 * The per-email bucket is intentionally generous relative to the IP bucket so a
 * legitimate user retrying from a shared corporate NAT is not locked out.
 */
const forgotPasswordRateLimiter = createRateLimiter({
  name: 'forgot-password',
  max: 5,
  windowMs: 15 * 60 * 1000,
  keys: (req) => {
    const ip    = req.ip || 'unknown';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;
    return email ? [`ip:${ip}`, `email:${email}`] : [`ip:${ip}`];
  },
});

/**
 * Limits reset-token submissions, which would otherwise permit brute-forcing
 * the 256-bit token. The entropy already makes that infeasible; this bounds the
 * request volume regardless.
 */
const resetPasswordRateLimiter = createRateLimiter({
  name: 'reset-password',
  max: 10,
  windowMs: 15 * 60 * 1000,
});

// Sweep expired buckets so the map cannot grow without bound. `unref` keeps this
// timer from holding the event loop open during a graceful shutdown.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

cleanupTimer.unref?.();

module.exports = {
  createRateLimiter,
  loginRateLimiter,
  resetLoginAttempts,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
};
