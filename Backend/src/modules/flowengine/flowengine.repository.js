const prisma = require('../../lib/prisma');

/**
 * Flow engine data access — the only file in the module touching Prisma.
 *
 * Flows (definitions), their published versions, the event outbox, and the
 * runs with their steps. Canvas graphs and payloads are JSON text; parsing
 * belongs to the callers.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createFlowEngineRepository(db) {
  const flowSelect = Object.freeze({
    id: true, module: true, name: true, description: true, status: true, live_version_id: true,
    created_at: true, updated_at: true, created_by: true, updated_by: true,
  });
  const versionSelect = Object.freeze({ id: true, flow_id: true, version: true, trigger: true, published_at: true, published_by: true });
  const runSelect = Object.freeze({
    id: true, flow_id: true, version_id: true, event_id: true, trigger: true, entity_type: true, entity_id: true,
    status: true, error: true, started_at: true, ended_at: true,
    version: { select: { version: true } },
  });

  return {
    // ── Flows ────────────────────────────────────────────────────────────────
    async findFlows({ where, skip, take }) {
      const scoped = { ...where, deleted_at: null };
      const [items, total] = await Promise.all([
        db.flowDefinition.findMany({ where: scoped, select: flowSelect, orderBy: [{ updated_at: 'desc' }, { id: 'desc' }], skip, take }),
        db.flowDefinition.count({ where: scoped }),
      ]);
      return { items, total };
    },

    /** A flow with its draft canvas (null when missing or deleted). */
    findFlow(id) {
      return db.flowDefinition.findFirst({ where: { id, deleted_at: null }, select: { ...flowSelect, draft_graph: true } });
    },

    createFlow(data) {
      return db.flowDefinition.create({ data, select: { ...flowSelect, draft_graph: true } });
    },

    updateFlow(id, data) {
      return db.flowDefinition.update({ where: { id }, data, select: { ...flowSelect, draft_graph: true } });
    },

    // ── Versions ─────────────────────────────────────────────────────────────
    listVersions(flowId) {
      return db.flowVersion.findMany({ where: { flow_id: flowId }, select: versionSelect, orderBy: { version: 'desc' } });
    },

    findVersion(id) {
      return db.flowVersion.findUnique({ where: { id }, select: { ...versionSelect, graph: true } });
    },

    async lastVersionNo(flowId) {
      const row = await db.flowVersion.findFirst({ where: { flow_id: flowId }, select: { version: true }, orderBy: { version: 'desc' } });
      return row?.version ?? 0;
    },

    /**
     * Freezes the canvas as the next version and makes it the live one, in one
     * transaction (two publishes at once cannot both take the same number:
     * the unique key refuses the second).
     */
    publish(flowId, { version, graph, trigger, actorId }) {
      return db.$transaction(async (tx) => {
        const v = await tx.flowVersion.create({
          data: { flow_id: flowId, version, graph, trigger, published_by: actorId },
          select: versionSelect,
        });
        const flow = await tx.flowDefinition.update({
          where: { id: flowId },
          data: { live_version_id: v.id, status: 'ACTIVE', updated_by: actorId },
          select: { ...flowSelect, draft_graph: true },
        });
        return { flow, version: v };
      });
    },

    /**
     * The live versions of active flows of `module` that start on `trigger`.
     * @returns {Promise<Array<{ flow: { id: number, name: string }, version: { id: number, version: number, graph: string } }>>}
     */
    async liveFlowsFor(module, trigger) {
      const flows = await db.flowDefinition.findMany({
        where: { module, status: 'ACTIVE', deleted_at: null, live_version_id: { not: null } },
        select: { id: true, name: true, live_version_id: true },
      });
      if (!flows.length) return [];
      const versions = await db.flowVersion.findMany({
        where: { id: { in: flows.map((f) => f.live_version_id) }, trigger },
        select: { id: true, flow_id: true, version: true, graph: true },
      });
      const byId = new Map(flows.map((f) => [f.id, f]));
      return versions.map((v) => ({ flow: { id: v.flow_id, name: byId.get(v.flow_id).name }, version: v }));
    },

    // ── Outbox ───────────────────────────────────────────────────────────────
    addEvent(data) {
      return db.flowEvent.create({ data, select: { id: true } });
    },

    /** Unprocessed events: never claimed, or claimed long ago by a worker that died. */
    pendingEvents({ staleBefore, maxAttempts, take }) {
      return db.flowEvent.findMany({
        where: {
          processed_at: null,
          attempts: { lt: maxAttempts },
          OR: [{ claimed_at: null }, { claimed_at: { lt: staleBefore } }],
        },
        orderBy: { id: 'asc' },
        take,
      });
    },

    /**
     * Claims an event for this worker. True only for the one worker whose
     * update matched — the others see 0 rows and skip it.
     */
    async claimEvent(id, { now, staleBefore }) {
      const r = await db.flowEvent.updateMany({
        where: { id, processed_at: null, OR: [{ claimed_at: null }, { claimed_at: { lt: staleBefore } }] },
        data: { claimed_at: now, attempts: { increment: 1 } },
      });
      return r.count === 1;
    },

    finishEvent(id, error = null) {
      return db.flowEvent.update({ where: { id }, data: { processed_at: new Date(), error } });
    },

    /** A failed attempt: release the claim so a later sweep retries it. */
    releaseEvent(id, error) {
      return db.flowEvent.update({ where: { id }, data: { claimed_at: null, error } });
    },

    purgeEvents(before) {
      return db.flowEvent.deleteMany({ where: { processed_at: { not: null, lt: before } } });
    },

    // ── People (for Assign and Notify) ───────────────────────────────────────
    /** Of these user ids, the ones that are active (not disabled, not deleted). */
    async activeUserIds(ids) {
      const want = [...new Set(ids.filter(Boolean).map(Number))];
      if (!want.length) return [];
      const rows = await db.user.findMany({ where: { id: { in: want }, status: 'ACTIVE', deleted_at: null }, select: { id: true } });
      return rows.map((r) => r.id);
    },

    /** A department's head, if the department exists. */
    async departmentHead(departmentId) {
      const d = await db.department.findFirst({ where: { id: departmentId, deleted_at: null }, select: { head_user_id: true } });
      return d?.head_user_id ?? null;
    },

    /** Active members of a department, by id. */
    async departmentMembers(departmentId) {
      const rows = await db.user.findMany({
        where: { department_id: departmentId, status: 'ACTIVE', deleted_at: null }, select: { id: true }, orderBy: { id: 'asc' },
      });
      return rows.map((r) => r.id);
    },

    /** Active users with a role, by id. */
    async roleMembers(roleId) {
      const rows = await db.user.findMany({
        where: { role_id: roleId, status: 'ACTIVE', deleted_at: null }, select: { id: true }, orderBy: { id: 'asc' },
      });
      return rows.map((r) => r.id);
    },

    /** The people, departments and roles named in blocks that no longer exist (or, for people, are inactive). */
    async missingRefs(refs) {
      const ids = (kind) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))];
      const [users, departments, roles] = await Promise.all([
        ids('user').length ? db.user.findMany({ where: { id: { in: ids('user') }, status: 'ACTIVE', deleted_at: null }, select: { id: true } }) : [],
        ids('department').length ? db.department.findMany({ where: { id: { in: ids('department') }, deleted_at: null }, select: { id: true } }) : [],
        ids('role').length ? db.role.findMany({ where: { id: { in: ids('role') }, deleted_at: null }, select: { id: true } }) : [],
      ]);
      const found = { user: new Set(users.map((r) => r.id)), department: new Set(departments.map((r) => r.id)), role: new Set(roles.map((r) => r.id)) };
      return ['user', 'department', 'role'].flatMap((kind) => ids(kind).filter((id) => !found[kind].has(id)).map((id) => ({ kind, id })));
    },

    /** "Turn by turn": who this Assign block gave the last record to. */
    async lastTurn(flowId, nodeId) {
      const row = await db.flowAssignState.findUnique({ where: { flow_id_node_id: { flow_id: flowId, node_id: nodeId } }, select: { last_user_id: true } });
      return row?.last_user_id ?? null;
    },

    saveTurn(flowId, nodeId, userId) {
      return db.flowAssignState.upsert({
        where: { flow_id_node_id: { flow_id: flowId, node_id: nodeId } },
        create: { flow_id: flowId, node_id: nodeId, last_user_id: userId },
        update: { last_user_id: userId },
      });
    },

    // ── Approvals ────────────────────────────────────────────────────────────
    /** Active Super Admins — who an approval escalates to. */
    async superAdminIds() {
      const rows = await db.user.findMany({ where: { status: 'ACTIVE', deleted_at: null, role: { is_system: true, deleted_at: null } }, select: { id: true }, orderBy: { id: 'asc' } });
      return rows.map((r) => r.id);
    },

    /** The latest not-yet-used request an Approval block made for this exact action. */
    openRequest({ flowId, nodeId, entityType, entityId, actionKey }) {
      return db.approvalRequest.findFirst({
        where: { flow_id: flowId, node_id: nodeId, entity_type: entityType, entity_id: String(entityId), action_key: actionKey, consumed_at: null },
        orderBy: { id: 'desc' },
        include: { approvers: true },
      });
    },

    /** A new request with its approvers (each PENDING, or already decided). */
    createRequest(data, approvers) {
      return db.approvalRequest.create({
        data: { ...data, approvers: { create: approvers } },
        include: { approvers: true },
      });
    },

    /** Uses up approved requests: the action they allowed went through. */
    consumeRequests(ids) {
      if (!ids.length) return null;
      return db.approvalRequest.updateMany({ where: { id: { in: ids }, status: 'APPROVED', consumed_at: null }, data: { consumed_at: new Date() } });
    },

    findRequest(id) {
      return db.approvalRequest.findUnique({ where: { id }, include: { approvers: { orderBy: { id: 'asc' } } } });
    },

    async findRequests({ where, skip, take }) {
      const [items, total] = await Promise.all([
        db.approvalRequest.findMany({ where, include: { approvers: { orderBy: { id: 'asc' } } }, orderBy: { id: 'desc' }, skip, take }),
        db.approvalRequest.count({ where }),
      ]);
      return { items, total };
    },

    countRequests(where) {
      return db.approvalRequest.count({ where });
    },

    /** Records one approver's decision (adding them first when a Super Admin decides in someone's place). */
    async recordDecision(requestId, userId, { decision, comment, addAsOverride }) {
      if (addAsOverride) {
        await db.approvalApprover.upsert({
          where: { request_id_user_id: { request_id: requestId, user_id: userId } },
          create: { request_id: requestId, user_id: userId, decision, comment, decided_at: new Date(), is_escalation: true },
          update: { decision, comment, decided_at: new Date() },
        });
        return;
      }
      await db.approvalApprover.update({
        where: { request_id_user_id: { request_id: requestId, user_id: userId } },
        data: { decision, comment, decided_at: new Date() },
      });
    },

    /** The newest still-pending request for an action on a record (keyPrefix narrows it, e.g. one offer). */
    pendingRequest({ entityType, entityId, action, keyPrefix }) {
      return db.approvalRequest.findFirst({
        where: {
          entity_type: entityType, entity_id: String(entityId), action, status: 'PENDING',
          ...(keyPrefix ? { action_key: { startsWith: keyPrefix } } : {}),
        },
        orderBy: { id: 'desc' },
        include: { approvers: true },
      });
    },

    /** The newest request of any status for an action on a record (keyPrefix narrows it). */
    latestRequest({ entityType, entityId, action, keyPrefix }) {
      return db.approvalRequest.findFirst({
        where: {
          entity_type: entityType, entity_id: String(entityId), action,
          ...(keyPrefix ? { action_key: { startsWith: keyPrefix } } : {}),
        },
        orderBy: { id: 'desc' },
        include: { approvers: true },
      });
    },

    /** Closes a request — only while it is still pending (true when this call closed it). */
    async closeRequest(id, { status, decidedBy, comment }) {
      const r = await db.approvalRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status, decided_by: decidedBy, decided_at: new Date(), comment: comment || null },
      });
      return r.count === 1;
    },

    setRequestRun(id, runId) {
      return db.approvalRequest.update({ where: { id }, data: { run_id: runId } });
    },

    /** Pending requests past their reminder time, not yet reminded. */
    async dueReminders(now) {
      const rows = await db.approvalRequest.findMany({ where: { status: 'PENDING', reminded_at: null }, include: { approvers: true } });
      return rows.filter((r) => now - r.created_at >= r.remind_hours * 36e5);
    },

    async claimReminder(id) {
      const r = await db.approvalRequest.updateMany({ where: { id, status: 'PENDING', reminded_at: null }, data: { reminded_at: new Date() } });
      return r.count === 1;
    },

    /** Pending requests past their escalation time, not yet escalated. */
    async dueEscalations(now) {
      const rows = await db.approvalRequest.findMany({ where: { status: 'PENDING', escalated_at: null }, include: { approvers: true } });
      return rows.filter((r) => now - r.created_at >= r.escalate_hours * 36e5);
    },

    async claimEscalation(id) {
      const r = await db.approvalRequest.updateMany({ where: { id, status: 'PENDING', escalated_at: null }, data: { escalated_at: new Date() } });
      return r.count === 1;
    },

    /** Adds people as approvers of a pending request (escalation); existing ones are left as they are. */
    async addApprovers(requestId, userIds) {
      for (const user_id of userIds) {
        await db.approvalApprover.upsert({
          where: { request_id_user_id: { request_id: requestId, user_id } },
          create: { request_id: requestId, user_id, is_escalation: true },
          update: {},
        });
      }
    },

    /** id → name (deleted users included). */
    async userNames(ids) {
      const want = [...new Set(ids.filter(Boolean))];
      if (!want.length) return new Map();
      const rows = await db.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true } });
      return new Map(rows.map((u) => [u.id, u.name]));
    },

    // ── Runs ─────────────────────────────────────────────────────────────────
    createRun(data) {
      return db.flowRun.create({ data, select: { id: true } });
    },

    finishRun(id, { status, error = null }) {
      return db.flowRun.update({ where: { id }, data: { status, error, ended_at: new Date() } });
    },

    addStep(data) {
      return db.flowRunStep.create({ data, select: { id: true } });
    },

    async findRuns({ where, skip, take }) {
      const [items, total] = await Promise.all([
        db.flowRun.findMany({ where, select: runSelect, orderBy: { id: 'desc' }, skip, take }),
        db.flowRun.count({ where }),
      ]);
      return { items, total };
    },

    findRun(id) {
      return db.flowRun.findUnique({
        where: { id },
        select: { ...runSelect, steps: { select: { id: true, node_id: true, node_type: true, status: true, output: true, error: true, started_at: true, ended_at: true }, orderBy: { id: 'asc' } } },
      });
    },
  };
}

const flowEngineRepository = createFlowEngineRepository(prisma);

module.exports = { flowEngineRepository, createFlowEngineRepository };
