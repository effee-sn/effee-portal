const { customerRepository } = require('./customer.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError, buildSearchClause } = require('../../core');

/**
 * Customer business logic.
 *
 * @param {ReturnType<typeof import('./customer.repository').createCustomerRepository>} repository
 */
function createCustomerService(repository) {
  const SORTABLE_FIELDS   = Object.freeze(['name', 'created_at']);
  const SEARCHABLE_FIELDS = Object.freeze(['name', 'gstin', 'email', 'phone', 'city']);

  /** @param {{ name: string, excludeId?: number }} params @throws {ConflictError} */
  async function assertUnique({ name, excludeId }) {
    const conflict = await repository.findConflicting({ name, excludeId });
    if (conflict) throw new ConflictError('A customer with this name already exists');
  }

  /** @param {number|null|undefined} ownerId @throws {ValidationError} */
  async function assertOwnerExists(ownerId) {
    if (ownerId === null || ownerId === undefined) return;
    if (!(await repository.userExists(ownerId))) {
      throw new ValidationError('Validation failed', [
        { field: 'owner_id', message: 'Selected owner does not exist' },
      ]);
    }
  }

  /** Only the writable columns, mapped from the validated DTO. */
  function pickWritable(dto, data = {}) {
    const fields = [
      'name', 'gstin', 'email', 'phone', 'website', 'industry',
      'billing_address', 'shipping_address', 'city', 'state', 'state_code',
      'pincode', 'notes', 'owner_id',
    ];
    for (const f of fields) if (dto[f] !== undefined) data[f] = dto[f];
    return data;
  }

  return {
    SORTABLE_FIELDS,

    /** @param {import('../../core/http/queryOptions').ListQuery} query */
    async list(query) {
      const search = buildSearchClause(query.search, [...SEARCHABLE_FIELDS]);
      const where = { ...query.filters, ...(search || {}) };
      return repository.findPage({ where, orderBy: query.orderBy, skip: query.skip, take: query.take });
    },

    /** Active customers for select inputs. */
    options() {
      return repository.findActiveOptions();
    },

    /** @param {number} id @throws {NotFoundError} */
    async getById(id) {
      const customer = await repository.findById(id);
      if (!customer) throw new NotFoundError('Customer');
      return customer;
    },

    /**
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async create(dto, actor) {
      await assertUnique({ name: dto.name });
      await assertOwnerExists(dto.owner_id);

      const data = pickWritable(dto, {
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });

      const customer = await repository.create(data);

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'Customer',
        entityId: customer.id,
        actor,
        changes: { name: customer.name, gstin: customer.gstin },
      });

      return customer;
    },

    /**
     * @param {number} id
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async update(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Customer');

      if (dto.name !== undefined) await assertUnique({ name: dto.name, excludeId: id });
      if (dto.owner_id !== undefined && dto.owner_id !== null) await assertOwnerExists(dto.owner_id);

      const data = pickWritable(dto, { updated_by: actor?.id ?? null });
      const customer = await repository.update(id, data);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Customer',
        entityId: id,
        actor,
        changes: auditService.diff(before, data),
      });

      return customer;
    },

    /**
     * Soft-deletes a customer. Refuses while enquiries still reference it.
     *
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     * @throws {NotFoundError|ConflictError}
     */
    async remove(id, actor) {
      const customer = await repository.findById(id);
      if (!customer) throw new NotFoundError('Customer');

      const enquiries = await repository.countEnquiries(id);
      if (enquiries > 0) {
        throw new ConflictError(
          `Cannot delete a customer with ${enquiries} enquiry(ies). Close or reassign them first.`
        );
      }

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'Customer',
        entityId: id,
        actor,
        changes: { name: customer.name, soft_deleted: true },
      });
    },
  };
}

const customerService = createCustomerService(customerRepository);

module.exports = { customerService, createCustomerService };
