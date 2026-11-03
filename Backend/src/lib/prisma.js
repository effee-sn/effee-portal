const { PrismaClient } = require('@prisma/client');
const { logger } = require('../core/logging/logger');

/**
 * Retries a query when the database connection had dropped.
 *
 * A pooled connection can die while idle — a managed database behind a load
 * balancer / NAT (Azure) drops ones idle for a few minutes, and a restarted
 * MySQL drops them all. The query that next picks up such a connection fails
 * although the database is fine. (`max_idle_connection_lifetime` in
 * DATABASE_URL avoids most of this; see .env.example — this is the backstop.)
 *
 * Measured on Prisma 5.22: a dead connection fails twice — P1001 ("can't reach
 * the server"), then P1017 ("server has closed the connection") — and the
 * third attempt runs on a fresh one. Hence up to two retries.
 *
 * Reads are retried on any connection error. A write only while the failures
 * are that dead-connection sequence, which starts with P1001 — the query never
 * reached the server. A write that fails with P1017 on its own may have lost
 * the connection after running, and repeating it could do it twice.
 */
const READS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', '$queryRaw', '$queryRawUnsafe',
]);
const CONNECTION_LOST = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
const LOST_MESSAGE = /server has closed the connection|server has gone away|connection reset|ECONNRESET|EPIPE|broken pipe/i;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 50;

const lost = (err) => !!err && (CONNECTION_LOST.has(err.code) || LOST_MESSAGE.test(err.message || ''));

/**
 * Whether a failed query may be run again.
 * @param {any[]} errors this query's failures so far, oldest first
 * @param {string} operation
 */
function shouldRetry(errors, operation) {
  if (!errors.length || errors.length > MAX_RETRIES || !errors.every(lost)) return false;
  if (READS.has(operation)) return true;
  return errors[0].code === 'P1001' && errors.slice(1).every((e) => e.code === 'P1017');
}

const prisma = new PrismaClient().$extends({
  name: 'retry-on-dropped-connection',
  query: {
    async $allOperations({ model, operation, args, query }) {
      const errors = [];
      for (;;) {
        try {
          return await query(args);
        } catch (err) {
          errors.push(err);
          if (!shouldRetry(errors, operation)) throw err;
          logger.warn({ model, operation, code: err.code, attempt: errors.length }, 'Database connection dropped — retrying the query');
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    },
  },
});

module.exports = prisma;
module.exports._test = { shouldRetry };
