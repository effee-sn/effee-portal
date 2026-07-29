const bcrypt = require('bcrypt');

const config = require('../../config/env');
const { usersRepository } = require('./users.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError, ForbiddenError, buildSearchClause } = require('../../core');

/**
 * Users business logic.
 *
 * Everything that constitutes a rule about users lives here: which fields must
 * be unique, when a password is rehashed, who may be deleted. The layer knows
 * nothing about HTTP — it receives plain objects and either returns data or
 * throws a typed error. That is what lets the same logic be reused later by a
 * background job, a CLI command, or an import routine without dragging Express
 * along.
 *
 * Errors thrown here are the domain vocabulary — `NotFoundError`,
 * `ConflictError` — and the error handler maps them to status codes. No status
 * code appears in this file.
 *
 * Built as a factory over its repository so it can be tested against a stub.
 *
 * @param {ReturnType<typeof import('./users.repository').createUsersRepository>} repository
 */
function createUsersService(repository) {
  /** Columns permitted in `?sort=`. Deliberately excludes `password`. */
  const SORTABLE_FIELDS = Object.freeze(['name', 'email', 'phone', 'status', 'created_at', 'updated_at']);

  /** Columns included in free-text search. */
  const SEARCHABLE_FIELDS = Object.freeze(['name', 'email', 'phone']);

  /**
   * Asserts that a role exists before it is assigned.
   *
   * Without this the database rejects the write with a foreign-key violation,
   * which surfaces as a generic conflict rather than telling the caller which
   * field was wrong.
   *
   * @param {number} roleId
   * @throws {ValidationError}
   */
  async function assertRoleExists(roleId) {
    if (!(await repository.roleExists(roleId))) {
      throw new ValidationError('Validation failed', [
        { field: 'role_id', message: 'Selected role does not exist' },
      ]);
    }
  }

  /**
   * Asserts a department exists, when one is supplied.
   * @param {number|null|undefined} departmentId
   * @throws {ValidationError}
   */
  async function assertDepartmentExists(departmentId) {
    if (departmentId === null || departmentId === undefined) return;
    if (!(await repository.departmentExists(departmentId))) {
      throw new ValidationError('Validation failed', [
        { field: 'department_id', message: 'Selected department does not exist' },
      ]);
    }
  }

  /**
   * Asserts that email and phone are not already taken.
   *
   * Checked before writing so the caller gets a precise message naming the
   * offending field. The unique constraints in the database remain the actual
   * guarantee — this check narrows the window but cannot close it, so a
   * concurrent insert still surfaces as a P2002, which the error handler maps
   * to the same 409.
   *
   * @param {object} params
   * @param {string} [params.email]
   * @param {string} [params.phone]
   * @param {number} [params.excludeId]
   * @throws {ConflictError}
   */
  async function assertUnique({ email, phone, excludeId }) {
    const conflict = await repository.findConflicting({ email, phone, excludeId });
    if (!conflict) return;

    const field = conflict.email === email ? 'Email' : 'Phone';
    throw new ConflictError(`${field} is already in use`);
  }

  return {
    SORTABLE_FIELDS,

    /**
     * Returns a page of users.
     *
     * @param {import('../../core/http/queryOptions').ListQuery} query
     * @returns {Promise<{ items: object[], total: number }>}
     */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);

      const where = {
        ...query.filters,
        ...(search || {}),
      };

      return repository.findPage({
        where,
        orderBy: query.orderBy,
        skip: query.skip,
        take: query.take,
      });
    },

    /**
     * @param {number} id
     * @returns {Promise<object>}
     * @throws {NotFoundError}
     */
    async getById(id) {
      const user = await repository.findById(id);
      if (!user) throw new NotFoundError('User');
      return user;
    },

    /**
     * Creates a user.
     *
     * @param {object} dto Validated input.
     * @param {string} dto.name
     * @param {string} dto.email
     * @param {string} dto.phone
     * @param {string} dto.password Plaintext; hashed here, never stored raw.
     * @param {number} dto.role_id
     * @param {'ACTIVE'|'INACTIVE'} [dto.status]
     * @returns {Promise<object>}
     */
    async create(dto, actor) {
      await assertRoleExists(dto.role_id);
      await assertDepartmentExists(dto.department_id);
      await assertUnique({ email: dto.email, phone: dto.phone });

      const password = await bcrypt.hash(dto.password, config.BCRYPT_ROUNDS);

      const user = await repository.create({
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        password,
        role_id: dto.role_id,
        status: dto.status || 'ACTIVE',
        department_id: dto.department_id ?? null,
        designation: dto.designation ?? null,
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'User',
        entityId: user.id,
        actor,
        // The password is stripped by the audit service's redaction, but it is
        // never included here in the first place.
        changes: { name: user.name, email: user.email, role_id: dto.role_id, status: user.status },
      });

      return user;
    },

    /**
     * Updates a user. Only supplied fields are changed.
     *
     * BEHAVIOUR CHANGE — `password` is now honoured. The previous
     * implementation destructured the body without it, so an administrator
     * resetting a user's password got a success response while the password was
     * silently left unchanged. The frontend has always sent the field
     * (Frontend/app/dashboard/users/page.js omits it only when blank), so this
     * makes an existing UI control work rather than adding a new one.
     *
     * @param {number} id
     * @param {object} dto Validated input; every field optional.
     * @returns {Promise<object>}
     * @throws {NotFoundError|ConflictError|ValidationError}
     */
    async update(id, dto, actor) {
      if (!(await repository.existsById(id))) throw new NotFoundError('User');

      if (dto.role_id !== undefined) await assertRoleExists(dto.role_id);
      if (dto.department_id !== undefined && dto.department_id !== null) {
        await assertDepartmentExists(dto.department_id);
      }

      if (dto.email !== undefined || dto.phone !== undefined) {
        await assertUnique({ email: dto.email, phone: dto.phone, excludeId: id });
      }

      /** @type {Record<string, unknown>} */
      const data = {};

      if (dto.name          !== undefined) data.name = dto.name;
      if (dto.email         !== undefined) data.email = dto.email;
      if (dto.phone         !== undefined) data.phone = dto.phone;
      if (dto.role_id       !== undefined) data.role_id = dto.role_id;
      if (dto.status        !== undefined) data.status = dto.status;
      if (dto.is_verified   !== undefined) data.is_verified = dto.is_verified;
      // `department_id` accepts null to clear the assignment.
      if (dto.department_id !== undefined) data.department_id = dto.department_id;
      if (dto.designation   !== undefined) data.designation = dto.designation;

      // Tracked separately so the audit entry records *that* the password
      // changed without the hash appearing in the trail.
      const passwordChanged = Boolean(dto.password);
      if (passwordChanged) {
        data.password = await bcrypt.hash(dto.password, config.BCRYPT_ROUNDS);
      }

      data.updated_by = actor?.id ?? null;

      const user = await repository.update(id, data);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'User',
        entityId: id,
        actor,
        changes: {
          fields: Object.keys(data).filter((key) => key !== 'password' && key !== 'updated_by'),
          ...(passwordChanged ? { password_changed: true } : {}),
        },
      });

      return user;
    },

    /**
     * Deletes a user.
     *
     * Two guards, both protecting against irrecoverable states rather than
     * enforcing policy:
     *
     *   - An account cannot delete itself. The actor would be holding a valid
     *     token for a user that no longer exists, and would be locked out mid
     *     session with no way back.
     *   - The last remaining system administrator cannot be deleted. Removing
     *     it leaves an installation where no one can manage roles or users,
     *     recoverable only by editing the database directly.
     *
     * Deletion is soft: the row is stamped with `deleted_at` and disappears
     * from every read, but survives so audit history keeps referring to a real
     * record.
     *
     * @param {number} id
     * @param {{ id: number }} actor The authenticated user performing the action.
     * @returns {Promise<void>}
     * @throws {NotFoundError|ForbiddenError}
     */
    async remove(id, actor) {
      const target = await repository.findWithRoleFlags(id);
      if (!target) throw new NotFoundError('User');

      if (actor?.id === id) {
        throw new ForbiddenError('You cannot delete your own account');
      }

      if (target.role.is_system && (await repository.countSystemAdmins()) <= 1) {
        throw new ForbiddenError(
          'Cannot delete the last system administrator — the system would become unmanageable'
        );
      }

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'User',
        entityId: id,
        actor,
        changes: { soft_deleted: true },
      });
    },
  };
}

/** Shared instance bound to the application's repository. */
const usersService = createUsersService(usersRepository);

module.exports = { usersService, createUsersService };
