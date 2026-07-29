const config = require('./config/env');

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');

const { requestLogger, errorHandler, notFoundHandler } = require('./core');

const app = express();

/**
 * Tells Express how many reverse proxies sit in front of the app so `req.ip`
 * resolves to the real client rather than the proxy. Rate limiting depends on
 * this being accurate: too high and a client can spoof its IP via
 * X-Forwarded-For, too low and every client shares one bucket.
 */
app.set('trust proxy', config.TRUST_PROXY_HOPS);

// Removes the default `X-Powered-By: Express` version disclosure.
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

/**
 * CORS is restricted to configured origins. Requests without an Origin header
 * (server-to-server calls, curl, health probes) are allowed through — CORS is a
 * browser-enforced control and blocking them provides no security benefit while
 * breaking legitimate non-browser clients.
 */
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    // Carries an explicit status so the terminal handler reports 403 rather
    // than treating a policy decision as an unexpected server fault.
    const error = new Error('Origin is not permitted by CORS policy');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  exposedHeaders: ['X-Request-Id'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/**
 * Assigns each request a correlation ID and logs it. Mounted before the routes
 * so every handled request is recorded, and before the static mount so asset
 * requests are visible too.
 */
app.use(requestLogger);

// Serve uploaded files. `dotfiles: 'deny'` and disabled directory indexes keep
// the static mount from exposing anything beyond the intended assets.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  dotfiles: 'deny',
  index: false,
}));

const routes = require('./routes');

app.get('/', (req, res) => {
  res.json({ message: 'Effee Portal API is running' });
});

/**
 * Liveness probe. Deliberately does not touch the database — its purpose is to
 * report that the process is up, which an orchestrator uses to decide whether
 * to restart the container. Readiness (including database reachability) is a
 * separate concern and belongs on its own endpoint.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/**
 * ── API versioning ───────────────────────────────────────────────────────────
 * `/api/v1` is the canonical prefix for all new work. `/api` is kept as an
 * unversioned alias because the current frontend is built against it
 * (Frontend/lib/config.js), and removing it would break every page.
 *
 * Both prefixes serve the same router today, so this costs nothing and buys the
 * ability to introduce `/api/v2` with breaking changes later while `/api/v1`
 * keeps serving existing clients. The alias should be retired once the frontend
 * has moved to the versioned prefix.
 *
 * Order matters: `/api/v1` must be registered first, or `/api` would match
 * `/api/v1/users` and strip only its own prefix, leaving an unroutable path.
 */
app.use('/api/v1', routes);
app.use('/api', routes);

// Unmatched routes return JSON rather than Express's default HTML page.
app.use(notFoundHandler);

// Terminal error handler — must be registered last.
app.use(errorHandler);

module.exports = app;
