const { flowEngineRepository } = require('./flowengine.repository');
const { catalogFor } = require('./catalog');
const { notificationService } = require('../notification/notification.service');

/**
 * The work blocks hand to the engine: picking who gets a record (Assign) and
 * who hears about it (Notify), and sending the notification. Blocks reach
 * these through `ctx.helpers`, so the block definitions stay free of the
 * database.
 *
 * @param {ReturnType<typeof import('./flowengine.repository').createFlowEngineRepository>} [repository]
 */
function createHelpers(repository = flowEngineRepository) {
  const firstActive = async (id) => (id && (await repository.activeUserIds([id])).length ? Number(id) : null);

  /** Of these people, the one holding the fewest open records (ties: the earliest added). */
  async function leastBusy(module, ids) {
    if (!ids.length) return null;
    const load = await catalogFor(module).openLoad(ids);
    return [...ids].sort((a, b) => (load.get(a) || 0) - (load.get(b) || 0) || a - b)[0];
  }

  /** Of these people, the one after whoever this block gave the last record to. */
  async function nextInTurn(flowId, nodeId, ids) {
    if (!ids.length) return null;
    const last = await repository.lastTurn(flowId, nodeId);
    const next = ids.find((id) => last === null || id > last) ?? ids[0];
    await repository.saveTurn(flowId, nodeId, next);
    return next;
  }

  return {
    /** A stage key → its name, for messages. */
    stageLabel(module) {
      const stages = catalogFor(module)?.stages || [];
      return (key) => stages.find((s) => s.key === key)?.label || key;
    },

    /**
     * Who an Assign block gives the record to — an active user, or null (the
     * module's built-in rule then decides).
     */
    async pickAssignee(node, ctx) {
      const d = node.data;
      const module = ctx.module;
      switch (d.to) {
        case 'PERSON': return firstActive(d.user_id);
        case 'OWNER': return firstActive(ctx.facts?.owner_id);
        case 'CREATOR': return firstActive(ctx.facts?.created_by);
        case 'SAME_AS_STAGE':
          return ctx.facts?.id ? firstActive(await catalogFor(module).heldAtStage(ctx.facts.id, d.stage)) : null;
        case 'DEPARTMENT': {
          const deptId = Number(d.department_id);
          if (d.pick === 'HEAD') return firstActive(await repository.departmentHead(deptId));
          const members = await repository.departmentMembers(deptId);
          return d.pick === 'TURN' ? nextInTurn(ctx.flow.id, node.id, members) : leastBusy(module, members);
        }
        case 'ROLE': {
          const members = await repository.roleMembers(Number(d.role_id));
          return d.pick === 'TURN' ? nextInTurn(ctx.flow.id, node.id, members) : leastBusy(module, members);
        }
        default: return null;
      }
    },

    /** The active people a Notify block's recipients mean, once each. */
    async recipients(list, ctx) {
      const f = ctx.facts || {};
      const ids = [];
      for (const r of list || []) {
        if (r.who === 'OWNER') ids.push(f.owner_id);
        else if (r.who === 'HANDLER') ids.push(f.handler_id);
        else if (r.who === 'CREATOR') ids.push(f.created_by);
        else if (r.who === 'PERSON') ids.push(Number(r.id));
        else if (r.who === 'ROLE') ids.push(...await repository.roleMembers(Number(r.id)));
        else if (r.who === 'DEPARTMENT') ids.push(...await repository.departmentMembers(Number(r.id)));
        else if (r.who === 'DEPARTMENT_HEAD') ids.push(await repository.departmentHead(Number(r.id)));
      }
      return repository.activeUserIds(ids);
    },

    /** Bell, push and email, like every portal notification. Best effort. */
    async notify({ userIds, title, message, ctx }) {
      if (!userIds.length) return;
      const c = catalogFor(ctx.module);
      await notificationService.notify({
        userIds,
        type: notificationService.Type.FLOW_NOTIFY,
        title,
        body: message || title,
        entityType: c.entityType,
        entityId: String(ctx.facts.id),
        link: c.linkFor(ctx.facts.id),
        // As elsewhere in the portal, nobody is notified of their own action.
        actorId: ctx.event?.actorId ?? null,
        email: {
          eyebrow: `${c.eyebrow} · ${ctx.flow.name}`,
          intro: message || title,
          details: c.emailRows(ctx.facts),
          reason: `You're receiving this because the "${ctx.flow.name}" flow in Flow Builder names you.`,
        },
      });
    },
  };
}

module.exports = { createHelpers };
