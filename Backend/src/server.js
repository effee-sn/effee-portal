// Loaded first so invalid configuration aborts the process before anything
// binds a port or opens a database connection.
const config = require('./config/env');

const app    = require('./app');
const prisma = require('./lib/prisma');
const { logger } = require('./core');

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, `Server listening on port ${config.PORT}`);
});

/**
 * Handles failures to bind the port.
 *
 * Without this, `listen` emits an unhandled 'error' event and the process dies
 * with no usable message — the common case being a second instance started
 * while the first is still running, which then looks like a mysterious silent
 * exit. Reported explicitly, with the remedy named.
 */
server.on('error', (/** @type {NodeJS.ErrnoException} */ err) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(
      { port: config.PORT },
      `Port ${config.PORT} is already in use — another instance is probably running. ` +
      'Stop it, or set PORT to a free port.'
    );
  } else if (err.code === 'EACCES') {
    logger.fatal({ port: config.PORT }, `Insufficient privileges to bind port ${config.PORT}`);
  } else {
    logger.fatal({ err }, 'Server failed to start');
  }

  // Flush the log before exiting: pino's transport writes on a worker thread,
  // and an immediate exit would discard the message just written.
  setTimeout(() => process.exit(1), 100).unref();
});

/** Guards against a second signal re-entering shutdown while it is in progress. */
let shuttingDown = false;

/**
 * Graceful shutdown.
 *
 * Stops accepting new connections, lets in-flight requests finish, then closes
 * the database pool. Without this, a deploy or container restart severs open
 * requests mid-transaction and leaves connections lingering on the MySQL side.
 *
 * @param {string} signal
 * @param {number} [exitCode]
 */
async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down gracefully');

  // Force exit if a hung connection prevents a clean close, so an orchestrator
  // is never left waiting on a process that will not terminate.
  const forceExit = setTimeout(() => {
    logger.fatal('Shutdown timed out after 10s — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
      logger.info('Shutdown complete');
      process.exit(exitCode);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

/**
 * A rejected promise with no handler leaves the process in an undefined state.
 * It is logged and the process is terminated so a supervisor can restart it,
 * rather than letting it continue serving traffic from a corrupted state.
 */
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException', 1);
});
