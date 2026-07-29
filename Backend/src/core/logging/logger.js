const pino = require('pino');
const config = require('../../config/env');

/**
 * Application logger.
 *
 * Replaces bare `console.log`, which produces unstructured text that cannot be
 * queried, filtered by level, or correlated across a request. Structured JSON
 * is what makes logs useful the moment this runs anywhere other than a
 * developer's terminal.
 *
 * ── Redaction is the important part ──────────────────────────────────────────
 * Request logging serialises headers and bodies, which on this API means
 * Authorization bearer tokens, login passwords, reset tokens, and SMTP
 * credentials. Any of those in a log file is a credential leak that outlives
 * the request — logs get shipped, archived, and read by people who should not
 * see them. The paths below are removed before anything is written.
 *
 * `redact` operates on the logged object's shape, so each location a secret can
 * appear must be listed explicitly.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'password',
  '*.password',
  'req.body.password',
  'req.body.new_password',
  'req.body.current_password',
  'req.body.smtp_pass',
  'req.body.token',
  'body.password',
  'token',
  'smtp_pass',
];

/**
 * Node's test runner sets `NODE_TEST_CONTEXT` in every test process. Detecting
 * it keeps request logs from drowning the assertion output, without requiring a
 * cross-platform way to set an environment variable in the npm script.
 * An explicit `LOG_LEVEL` still wins, so logs can be turned back on to debug a
 * failing test.
 */
const IS_TEST = Boolean(process.env.NODE_TEST_CONTEXT);

/** @returns {string} */
function resolveLevel() {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  if (IS_TEST) return 'silent';
  return config.IS_PRODUCTION ? 'info' : 'debug';
}

const logger = pino({
  level: resolveLevel(),

  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
  },

  // ISO timestamps rather than epoch millis — log aggregators parse them
  // directly and a human reading raw output can make sense of them.
  timestamp: pino.stdTimeFunctions.isoTime,

  formatters: {
    // Emit `level: "info"` instead of `level: 30`, so a reader does not need a
    // lookup table for the numeric levels.
    level: (label) => ({ level: label }),
  },

  base: {
    env: config.NODE_ENV,
  },

  // Human-readable colourised output in development; raw JSON in production,
  // where a log shipper consumes it. The pretty transport is also skipped under
  // test, where it would spawn a worker thread per test process for output that
  // is silenced anyway.
  ...(config.IS_PRODUCTION || IS_TEST ? {} : {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname,env',
      },
    },
  }),
});

module.exports = { logger, REDACTED_PATHS };
