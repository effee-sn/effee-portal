const pinoHttp = require('pino-http');
const crypto = require('crypto');
const { logger } = require('./logger');

/**
 * Per-request logging with a correlation ID.
 *
 * Every request is assigned an ID that appears on its access log line, on any
 * error logged while handling it, and in the `X-Request-Id` response header.
 * That is what turns "a user reports an error" into a single grep: the user
 * quotes the ID from the failed response and every log line for that request
 * is retrievable.
 *
 * An inbound `X-Request-Id` is honoured when present so a trace started by a
 * gateway or another service carries through instead of being restarted here.
 *
 * Attaches `req.log`, a child logger already bound to the request ID.
 */
const requestLogger = pinoHttp({
  logger,

  genReqId: (req, res) => {
    const inbound = req.headers['x-request-id'];

    // Bound the accepted length — this value is echoed into a response header
    // and written to logs, so an unbounded client-supplied string is a log
    // injection and header-size concern.
    const id = typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 128
      ? inbound
      : crypto.randomUUID();

    res.setHeader('X-Request-Id', id);
    return id;
  },

  /**
   * Maps status codes to log levels so that routine 4xx traffic does not read
   * as breakage. A 404 or a rejected login is normal operation; only 5xx
   * indicates something is actually wrong with the service.
   */
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} → ${res.statusCode} (${err.message})`,

  // Trim the serialised request and response to the fields worth keeping.
  // The defaults include full header sets, which are noisy and are the main
  // place credentials would otherwise appear.
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

module.exports = { requestLogger };
