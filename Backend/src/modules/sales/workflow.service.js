const { workflowRepository } = require('./workflow.repository');
const { auditService } = require('../audit/audit.service');
const { ValidationError } = require('../../core');

/**
 * Sales workflow configuration business logic.
 *
 * The sales pipeline hands an enquiry between two people: the field initiator
 * (who raised it) and a single Internal Sales handler selected here. This layer
 * reads and updates that selection; the handoff itself lives in the enquiry
 * service (see its `assignHandler`).
 *
 * @param {ReturnType<typeof import('./workflow.repository').createWorkflowRepository>} repository
 */
function createWorkflowService(repository) {
  return {
    /** The current config (internal handler), created empty on first read. */
    get() {
      return repository.get();
    },

    /**
     * Sets (or clears) the Internal Sales handler.
     * @param {{ internal_user_id: number|null }} dto
     * @param {import('../../core/http/requestContext').ActorContext} [actor]
     */
    async update(dto, actor) {
      const internalUserId = dto.internal_user_id ?? null;
      if (internalUserId !== null && !(await repository.userExists(internalUserId))) {
        throw new ValidationError('Validation failed', [
          { field: 'internal_user_id', message: 'Selected user does not exist' },
        ]);
      }

      const config = await repository.setInternalUser(internalUserId, actor?.id ?? null);

      await auditService.record({
        action: auditService.Action.UPDATE,
        entity: 'SalesWorkflowConfig',
        entityId: config.id,
        actor,
        changes: { internal_user_id: internalUserId },
      });

      return config;
    },
  };
}

const workflowService = createWorkflowService(workflowRepository);

module.exports = { workflowService, createWorkflowService };
