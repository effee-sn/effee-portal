const { auditRepository } = require('./audit.repository');
const { logger } = require('../../core/logging/logger');

/**
 * Audit trail.
 *
 * Records who did what to which record. Distinct from the application log:
 * logs describe behaviour and are rotated away, whereas this is evidence and
 * must survive. It answers "who deactivated this account, and when" months
 * after the fact.
 *
 * ── Never throws ─────────────────────────────────────────────────────────────
 * Every write is best-effort. A failure to record an audit entry must not fail
 * the operation that triggered it — refusing to let an administrator reset a
 * password because a logging insert deadlocked would be a worse outcome than
 * the missing entry. Failures are reported to the application log instead, and
 * are loud enough to notice.
 *
 * @param {ReturnType<typeof import('./audit.repository').createAuditRepository>} repository
 */
function createAuditService(repository) {
  /** Standard action verbs. Strings, not an enum, so modules can add their own. */
  const Action = Object.freeze({
    CREATE:          'CREATE',
    UPDATE:          'UPDATE',
    DELETE:          'DELETE',
    LOGIN:           'LOGIN',
    LOGIN_FAILED:    'LOGIN_FAILED',
    PASSWORD_CHANGED:'PASSWORD_CHANGED',
    PASSWORD_RESET:  'PASSWORD_RESET',
    PERMISSIONS_SET: 'PERMISSIONS_SET',
    SETTINGS_UPDATED:'SETTINGS_UPDATED',
  });

  /**
   * Field names never written to the audit trail.
   *
   * The trail is long-lived and widely readable — precisely the place a leaked
   * secret does the most damage. Values for these keys are replaced with a
   * marker so the entry still records *that* the field changed.
   */
  const SENSITIVE_KEYS = new Set([
    'password', 'new_password', 'current_password',
    'smtp_pass', 'token', 'secret',
  ]);

  /**
   * Strips secrets from a payload before it is persisted.
   *
   * @param {unknown} value
   * @returns {unknown}
   */
  function redact(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(redact);

    return Object.fromEntries(
      Object.entries(value).map(([key, val]) =>
        SENSITIVE_KEYS.has(key) ? [key, '[REDACTED]'] : [key, redact(val)]
      )
    );
  }

  /**
   * Serialises the change payload.
   *
   * Stored as text rather than a JSON column because the deployment target is
   * MariaDB, where Prisma's Json support is less dependable than on MySQL 8.
   *
   * @param {unknown} changes
   * @returns {string|null}
   */
  function serialise(changes) {
    if (changes === undefined || changes === null) return null;

    try {
      const json = JSON.stringify(redact(changes));
      // Guard against an oversized payload filling the column; the entry
      // matters more than the full diff.
      return json.length > 8000 ? `${json.slice(0, 8000)}…[truncated]` : json;
    } catch {
      return null;
    }
  }

  return {
    Action,

    /**
     * Records an audit entry.
     *
     * @param {object} params
     * @param {string} params.action One of `Action`, or a module-specific verb.
     * @param {string} params.entity Target type, e.g. "User".
     * @param {string|number} [params.entityId]
     * @param {import('../../core/http/requestContext').ActorContext} [params.actor]
     * @param {unknown} [params.changes] Serialisable description of the change.
     * @returns {Promise<void>}
     */
    async record({ action, entity, entityId, actor, changes }) {
      try {
        await repository.create({
          action,
          entity,
          entity_id:   entityId !== undefined && entityId !== null ? String(entityId) : null,
          actor_id:    actor?.id ?? null,
          actor_email: actor?.email ?? null,
          ip:          actor?.ip ?? null,
          user_agent:  actor?.user_agent ?? null,
          request_id:  actor?.request_id ?? null,
          changes:     serialise(changes),
        });
      } catch (err) {
        logger.error({ err, action, entity, entityId }, 'Failed to write audit log entry');
      }
    },

    /**
     * Reads the audit trail.
     *
     * @param {object} query
     * @param {Record<string, unknown>} [query.filters]
     * @param {number} query.skip
     * @param {number} query.take
     * @param {Record<string, 'asc'|'desc'>} [query.orderBy]
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async list({ filters = {}, skip, take, orderBy = { created_at: 'desc' } }) {
      const { items, total } = await repository.findPage({
        where: filters, orderBy, skip, take,
      });

      // `changes` is stored as text; parse it back so callers receive
      // structured data rather than a string they must parse themselves.
      return {
        items: items.map((entry) => ({
          ...entry,
          changes: entry.changes ? safeParse(entry.changes) : null,
        })),
        total,
      };
    },
  };
}

/**
 * @param {string} json
 * @returns {unknown} The parsed value, or the raw string if it is not valid
 *   JSON — a truncated payload should still be visible rather than discarded.
 */
function safeParse(json) {
  try { return JSON.parse(json); } catch { return json; }
}

const auditService = createAuditService(auditRepository);

module.exports = { auditService, createAuditService };
