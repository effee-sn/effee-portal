const { contactRepository } = require('./contact.repository');
const { customerRepository } = require('./customer.repository');
const { auditService } = require('../audit/audit.service');
const { NotFoundError } = require('../../core');

/**
 * Contact business logic. A contact always belongs to a customer; the customer
 * is resolved from the route and validated to exist (and be live).
 *
 * @param {ReturnType<typeof import('./contact.repository').createContactRepository>} repository
 * @param {ReturnType<typeof import('./customer.repository').createCustomerRepository>} customers
 */
function createContactService(repository, customers) {
  /** @param {number} customerId @throws {NotFoundError} */
  async function assertCustomer(customerId) {
    if (!(await customers.existsById(customerId))) throw new NotFoundError('Customer');
  }

  function pickWritable(dto, data = {}) {
    for (const f of ['name', 'designation', 'email', 'phone', 'is_primary', 'notes']) {
      if (dto[f] !== undefined) data[f] = dto[f];
    }
    return data;
  }

  return {
    /** @param {number} customerId */
    async listForCustomer(customerId) {
      await assertCustomer(customerId);
      return repository.findByCustomer(customerId);
    },

    /**
     * @param {number} customerId
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async create(customerId, dto, actor) {
      await assertCustomer(customerId);

      const data = pickWritable(dto, {
        customer_id: customerId,
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });

      const contact = await repository.create(data);
      // Enforce a single primary contact per customer.
      if (contact.is_primary) await repository.clearPrimary(customerId, contact.id);

      await auditService.record({
        action: auditService.Action.CREATE,
        entity: 'Contact',
        entityId: contact.id,
        actor,
        changes: { name: contact.name, customer_id: customerId },
      });

      return contact;
    },

    /**
     * @param {number} id
     * @param {object} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async update(id, dto, actor) {
      const before = await repository.findById(id);
      if (!before) throw new NotFoundError('Contact');

      const data = pickWritable(dto, { updated_by: actor?.id ?? null });
      const contact = await repository.update(id, data);
      if (contact.is_primary) await repository.clearPrimary(contact.customer_id, contact.id);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'Contact',
        entityId: id,
        actor,
        changes: auditService.diff(before, data),
      });

      return contact;
    },

    /**
     * @param {number} id
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async remove(id, actor) {
      const contact = await repository.findById(id);
      if (!contact) throw new NotFoundError('Contact');

      await repository.softDelete(id, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.DELETE,
        entity: 'Contact',
        entityId: id,
        actor,
        changes: { name: contact.name, soft_deleted: true },
      });
    },
  };
}

const contactService = createContactService(contactRepository, customerRepository);

module.exports = { contactService, createContactService };
