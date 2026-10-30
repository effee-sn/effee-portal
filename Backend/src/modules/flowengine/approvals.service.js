const crypto = require('crypto');
const { flowEngineRepository } = require('./flowengine.repository');
const { catalogFor } = require('./catalog');
const { nodeType } = require('./nodes');
const { parseGraph, nextNodes } = require('./graph');
const { executeRun } = require('./runner');
const { createHelpers } = require('./helpers');
const { emitFlowEvent } = require('./events');
const { notificationService } = require('../notification/notification.service');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ForbiddenError, logger } = require('../../core');

/**
 * Approvals asked for by Flow Builder flows: raising a request (from the
 * guard, at the moment of the held action), deciding it (My Approvals), and the
 * reminder / escalation sweep. A decision continues the flow down its
 * Approved or Rejected way; an approved action goes through when it is tried
 * again (the guard then uses the approval up).
 *
 * @param {ReturnType<typeof import('./flowengine.repository').createFlowEngineRepository>} repository
 */
function createApprovalsService(repository) {
  const helpers = createHelpers(repository);
  const LINK = (id) => `/dashboard/approvals?id=${id}`;

  async function names(ids) {
    const map = await repository.userNames(ids);
    return ids.map((id) => map.get(id)).filter(Boolean);
  }

  /** "Ravi Kumar", "Ravi Kumar or Asha Rao", "Ravi Kumar and 2 others". */
  function joinNames(list, mode) {
    if (!list.length) return 'an approver';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} ${mode === 'ALL' ? 'and' : 'or'} ${list[1]}`;
    return `${list[0]} ${mode === 'ALL' ? 'and' : 'or'} ${list.length - 1} others`;
  }

  /** Tells approvers a request needs them (new, reminder or escalation). */
  async function tellApprovers(req, userIds, kind, requesterName) {
    if (!userIds.length) return;
    const lead = {
      new: `${requesterName || 'Someone'} needs your approval`,
      reminder: 'Still waiting for your approval',
      escalated: `Waiting ${Math.round((Date.now() - req.created_at) / 36e5)} hours — passed to you to decide`,
    }[kind];
    await notificationService.notify({
      userIds,
      type: notificationService.Type.FLOW_APPROVAL,
      title: `${kind === 'reminder' ? 'Reminder — approval' : 'Approval'} needed: ${req.title}`,
      body: `${lead}. ${String(req.summary || '').split('\n')[0]}`.trim(),
      entityType: req.entity_type,
      entityId: req.entity_id,
      link: LINK(req.id),
      actorId: kind === 'new' ? req.requested_by : null,
      email: {
        eyebrow: 'Approval needed',
        intro: `${lead}: ${req.title}.`,
        details: String(req.summary || '').split('\n').filter(Boolean).map((line) => {
          const i = line.indexOf(': ');
          return i > 0 ? [line.slice(0, i), line.slice(i + 2)] : ['', line];
        }),
        actionLabel: 'Review and decide',
        reason: 'You\'re receiving this because a Flow Builder flow names you as an approver.',
      },
    });
  }

  const WAY = Object.freeze({ APPROVED: 'approved', REJECTED: 'rejected', WITHDRAWN: 'withdrawn' });
  const STATUS_LABEL = Object.freeze({ APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn', CANCELLED: 'Cancelled' });

  /**
   * Continues the flow down the decided way (Approved / Rejected / Withdrawn),
   * in its run log.
   * @returns {Promise<boolean>} whether that way out leads anywhere
   */
  async function continueFlow(req, outcome, decidedBy, comment) {
    try {
      const version = await repository.findVersion(req.version_id);
      const graph = parseGraph(version?.graph);
      if (!graph) return false;
      const handle = WAY[outcome];
      const start = nextNodes(graph, req.node_id, handle);
      let runId = req.run_id;
      if (!runId) {
        runId = (await repository.createRun({
          flow_id: req.flow_id, version_id: req.version_id, trigger: req.action, entity_type: req.entity_type, entity_id: req.entity_id,
        })).id;
      }
      await repository.addStep({
        run_id: runId, node_id: req.node_id, node_type: 'approval', status: 'DONE', ended_at: new Date(),
        output: JSON.stringify({ handle, result: { request_id: req.id, status: outcome, decided_by: decidedBy, comment: comment || null } }),
      });
      const catalog = catalogFor(req.module);
      const facts = catalog && req.entity_type === catalog.entityType ? await catalog.loadEntity(req.entity_id) : null;
      const [decider] = await names([decidedBy]);
      const flowRow = await repository.findFlow(req.flow_id);
      const event = { type: req.action, payload: req.payload ? JSON.parse(req.payload) : {}, actorId: decidedBy };
      const ctx = {
        mode: 'run',
        module: req.module,
        event,
        facts: facts && { ...facts, 'approval.decided_by': decider || null, 'approval.comment': comment || null, 'approval.status': STATUS_LABEL[outcome] },
        flow: { id: req.flow_id, name: flowRow?.name || 'flow' },
        version: { id: version.id, version: version.version },
        helpers,
        emit: (e) => emitFlowEvent({ ...e, depth: 1, originFlowId: req.flow_id }),
      };
      await executeRun({ repository, nodeType, runId, graph, ctx, start });
      return start.length > 0;
    } catch (err) {
      logger.error({ err, requestId: req.id }, 'Flow could not continue after the approval decision');
      return false;
    }
  }

  // Published versions never change, so their Approval settings can be kept.
  const versionGraphs = new Map();

  /** Whether the Approval block that raised it lets the person who asked take it back. */
  async function withdrawable(req) {
    if (!versionGraphs.has(req.version_id)) {
      versionGraphs.set(req.version_id, parseGraph((await repository.findVersion(req.version_id))?.graph));
    }
    const node = versionGraphs.get(req.version_id)?.nodes.find((x) => x.id === req.node_id);
    return node?.data?.allow_withdraw !== false;
  }

  /** What a requester / approver sees, with names. */
  async function shape(req) {
    const map = await repository.userNames([req.requested_by, req.decided_by, ...req.approvers.map((a) => a.user_id)]);
    return {
      id: req.id, module: req.module, flow_id: req.flow_id, entity_type: req.entity_type, entity_id: req.entity_id,
      action: req.action, title: req.title, summary: req.summary, link: req.link, mode: req.mode, status: req.status,
      requested_by: req.requested_by, requested_by_name: map.get(req.requested_by) || null,
      decided_by: req.decided_by, decided_by_name: map.get(req.decided_by) || null, decided_at: req.decided_at, comment: req.comment,
      consumed_at: req.consumed_at, created_at: req.created_at, escalated_at: req.escalated_at,
      can_withdraw: req.status === 'PENDING' && await withdrawable(req),
      approvers: req.approvers.map((a) => ({
        user_id: a.user_id, name: map.get(a.user_id) || null, decision: a.decision, comment: a.comment, decided_at: a.decided_at, is_escalation: a.is_escalation,
      })),
    };
  }

  return {
    joinNames,
    names,

    /**
     * Raises a request for a held action. The approvers are the Approval
     * block's people (active ones); nobody → the Super Admins. When the person
     * acting is themselves an approver (and one approval is enough), it is
     * approved there and then.
     * @returns {Promise<object>} the request (status PENDING or APPROVED)
     */
    async request({ module, flow, version, node, entityType, entityId, action, actionKey, title, summary, link, payload, actor, ctx, trail }) {
      let approverIds = await helpers.recipients(node.data.to, ctx);
      let escalated = false;
      if (!approverIds.length) { approverIds = await repository.superAdminIds(); escalated = true; }
      const mode = node.data.mode === 'ALL' ? 'ALL' : 'ANY';
      const actorId = actor?.id ?? null;
      const actorIsApprover = actorId !== null && approverIds.includes(actorId);
      const autoApproved = actorIsApprover && (mode === 'ANY' || approverIds.length === 1);
      const now = new Date();
      // One waiting request per block + action: a second click at the same moment
      // hits the unique key and gets the first request back (asked once, told once).
      const openKey = autoApproved ? null : crypto.createHash('sha256')
        .update(`${flow.id}|${node.id}|${entityType}|${entityId}|${actionKey}`).digest('hex');
      let req;
      try {
        req = await repository.createRequest({
          module, flow_id: flow.id, version_id: version.id, node_id: node.id, entity_type: entityType, entity_id: String(entityId),
          action, action_key: actionKey, title, summary, link, payload: JSON.stringify(payload || {}), mode,
          status: autoApproved ? 'APPROVED' : 'PENDING', requested_by: actorId, open_key: openKey,
          ...(autoApproved ? { decided_by: actorId, decided_at: now, comment: 'Approved by doing it themselves (an approver)' } : {}),
          remind_hours: Number(node.data.remind_hours) || 4,
          escalate_hours: Number(node.data.escalate_hours) || 24,
          ...(escalated ? { escalated_at: now } : {}),
        }, approverIds.map((user_id) => ({
          user_id, is_escalation: escalated,
          ...(user_id === actorId ? { decision: 'APPROVED', decided_at: now, comment: 'Did it themselves' } : {}),
        })));
      } catch (err) {
        if (err.code !== 'P2002' || !openKey) throw err;
        const first = await repository.findOpenRequest(openKey);
        if (!first) throw err;
        return first; // already asked a moment ago — that one stands
      }
      if (req.status === 'PENDING') {
        // The run log: the path up to the Approval, waiting.
        const run = await repository.createRun({
          flow_id: flow.id, version_id: version.id, trigger: action, entity_type: entityType, entity_id: String(entityId), status: 'WAITING',
        });
        for (const s of trail) {
          await repository.addStep({ run_id: run.id, node_id: s.node.id, node_type: s.node.type, status: 'DONE', ended_at: new Date(), output: JSON.stringify({ handle: s.handle }) });
        }
        await repository.addStep({ run_id: run.id, node_id: node.id, node_type: 'approval', status: 'DONE', output: JSON.stringify({ handle: null, result: { request_id: req.id, status: 'WAITING' } }) });
        await repository.setRequestRun(req.id, run.id);
        const [requester] = await names([actorId]);
        await tellApprovers(req, req.approvers.filter((a) => a.decision === 'PENDING').map((a) => a.user_id), 'new', requester);
      }
      await auditService.record({
        action: auditService.Action.CREATE, entity: 'ApprovalRequest', entityId: req.id, actor,
        changes: { flow_id: flow.id, action, action_key: actionKey, entity: `${entityType} ${entityId}`, status: req.status },
      });
      return req;
    },

    /**
     * My Approvals. tab: waiting (for me to decide), decided (by me),
     * requested (by me), all (Super Admin).
     */
    async list({ tab = 'waiting', status, skip = 0, take = 50 }, actor) {
      const me = actor?.id;
      let where;
      if (tab === 'all') {
        if (!actor?.is_system) throw new ForbiddenError('Only a Super Admin sees every approval');
        where = {};
      } else if (tab === 'requested') where = { requested_by: me };
      else if (tab === 'decided') where = { approvers: { some: { user_id: me, decision: { not: 'PENDING' } } } };
      else where = { status: 'PENDING', approvers: { some: { user_id: me, decision: 'PENDING' } } };
      if (status) where.status = status;
      const page = await repository.findRequests({ where, skip, take });
      return { total: page.total, items: await Promise.all(page.items.map(shape)) };
    },

    /** How many wait for this person — the badge. */
    count(actor) {
      return repository.countRequests({ status: 'PENDING', approvers: { some: { user_id: actor?.id, decision: 'PENDING' } } });
    },

    /** One request — for its approvers, its requester and Super Admins. */
    async get(id, actor) {
      const req = await repository.findRequest(id);
      if (!req) throw new NotFoundError('Approval');
      const involved = actor?.is_system || req.requested_by === actor?.id || req.approvers.some((a) => a.user_id === actor?.id);
      if (!involved) throw new NotFoundError('Approval');
      return shape(req);
    },

    /**
     * Approve or reject. Any one approver decides an ANY request; an ALL
     * request needs everyone (one rejection rejects). A Super Admin may decide
     * any pending request.
     * @param {number} id
     * @param {{ decision: 'APPROVED'|'REJECTED', comment?: string }} dto
     */
    async decide(id, dto, actor) {
      const req = await repository.findRequest(id);
      if (!req) throw new NotFoundError('Approval');
      if (req.status !== 'PENDING') throw new ConflictError(`This approval was already ${req.status.toLowerCase()}`);
      const mine = req.approvers.find((a) => a.user_id === actor?.id);
      if (mine && mine.decision !== 'PENDING') throw new ConflictError('You have already decided this one');
      if (!mine && !actor?.is_system) throw new ForbiddenError('You are not an approver of this request');
      const comment = (dto.comment || '').trim() || null;
      if (dto.decision === 'REJECTED' && !comment) {
        throw new ConflictError('Say why it is rejected — the requester sees your comment');
      }
      await repository.recordDecision(req.id, actor.id, { decision: dto.decision, comment, addAsOverride: !mine });

      // A Super Admin — named, or brought in by escalation — decides outright;
      // otherwise an ALL request waits for every named approver. Counted from a
      // fresh read, so two approving at the same moment still close it.
      const override = !mine || mine.is_escalation;
      let outcome = dto.decision;
      if (dto.decision === 'APPROVED' && req.mode === 'ALL' && !override) {
        const now = await repository.findRequest(id);
        if (now.approvers.some((a) => !a.is_escalation && a.decision !== 'APPROVED')) outcome = null; // still waiting for the rest
      }
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'ApprovalRequest', entityId: req.id, actor,
        changes: { decision: dto.decision, ...(comment ? { comment } : {}), ...(override ? { as_super_admin: true } : {}) },
      });
      if (!outcome) return shape(await repository.findRequest(id));

      if (!(await repository.closeRequest(req.id, { status: outcome, decidedBy: actor.id, comment }))) {
        // The other approver closed it the same way a moment ago — that is fine.
        const settled = await repository.findRequest(id);
        if (settled.status === outcome) return shape(settled);
        throw new ConflictError('Someone decided this approval just now — reload to see it');
      }
      const closed = await repository.findRequest(id);
      const [decider] = await names([actor.id]);
      if (closed.requested_by) {
        await notificationService.notify({
          userIds: [closed.requested_by],
          type: notificationService.Type.FLOW_APPROVAL_DECIDED,
          title: `${outcome === 'APPROVED' ? 'Approved' : 'Rejected'}: ${closed.title}`,
          body: outcome === 'APPROVED'
            ? `${decider || 'The approver'} approved it — you can go ahead now.${comment ? ` “${comment}”` : ''}`
            : `${decider || 'The approver'} rejected it: “${comment}”`,
          entityType: closed.entity_type,
          entityId: closed.entity_id,
          link: closed.link || LINK(closed.id),
          actorId: actor.id,
          email: {
            eyebrow: outcome === 'APPROVED' ? 'Approved' : 'Rejected',
            intro: outcome === 'APPROVED'
              ? `${decider || 'The approver'} approved “${closed.title}”. Do it again in the portal and it will go through.`
              : `${decider || 'The approver'} rejected “${closed.title}”.`,
            details: [['Decided by', decider], ['Comment', comment]],
            actionLabel: 'Open in the portal',
          },
        });
      }
      await continueFlow(closed, outcome, actor.id, comment);
      return shape(await repository.findRequest(id));
    },

    /**
     * The person who asked (or a Super Admin) takes a waiting request back —
     * e.g. a wrong figure was sent for approval. It closes as Withdrawn, the
     * held action is free to be reworked, and the flow goes down its Withdrawn
     * way. With nothing on that way, the approvers still get one notice so
     * they don't go looking for it.
     * @param {number} id
     * @param {{ comment?: string }} dto
     */
    async withdraw(id, dto, actor) {
      const req = await repository.findRequest(id);
      if (!req) throw new NotFoundError('Approval');
      if (req.status !== 'PENDING') throw new ConflictError(`This approval was already ${req.status.toLowerCase()}`);
      if (req.requested_by !== actor?.id && !actor?.is_system) {
        throw new ForbiddenError('Only the person who asked for this approval can withdraw it');
      }
      if (!(await withdrawable(req))) {
        throw new ConflictError('This approval cannot be withdrawn — ask the approver to reject it instead');
      }
      const comment = (dto.comment || '').trim() || null;
      if (!comment) throw new ConflictError('Say why it is withdrawn — the approvers see it');

      if (!(await repository.closeRequest(req.id, { status: 'WITHDRAWN', decidedBy: actor.id, comment }))) {
        throw new ConflictError('Someone decided this approval just now — reload to see it');
      }
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'ApprovalRequest', entityId: req.id, actor,
        changes: { status: { from: 'PENDING', to: 'WITHDRAWN' }, comment },
      });
      const closed = await repository.findRequest(id);
      const handled = await continueFlow(closed, 'WITHDRAWN', actor.id, comment);
      if (!handled) {
        const [who] = await names([actor.id]);
        const approvers = closed.approvers.filter((a) => a.decision === 'PENDING' && a.user_id !== actor.id).map((a) => a.user_id);
        if (approvers.length) {
          await notificationService.notify({
            userIds: approvers,
            type: notificationService.Type.FLOW_APPROVAL_DECIDED,
            title: `Withdrawn: ${closed.title}`,
            body: `${who || 'The requester'} withdrew it — no action needed. “${comment}”`,
            entityType: closed.entity_type,
            entityId: closed.entity_id,
            link: closed.link || LINK(closed.id),
            actorId: actor.id,
            email: {
              eyebrow: 'Withdrawn',
              intro: `${who || 'The requester'} withdrew “${closed.title}” — no action needed from you.`,
              details: [['Withdrawn by', who], ['Reason', comment]],
              actionLabel: 'Open in the portal',
            },
          });
        }
      }
      return shape(await repository.findRequest(id));
    },

    /**
     * Closes a flow's waiting requests when the flow is paused, deleted, or
     * re-published without the Approval block that raised them: the action no
     * longer needs that approval, so nothing should stay locked or keep
     * reminding. Approvers are told "no action needed"; the person who asked is
     * told to try again.
     * @param {number} flowId
     * @param {{ keepNodeIds?: string[], reason: string }} p
     * @returns {Promise<number>} how many were cancelled
     */
    async cancelForFlow(flowId, { keepNodeIds, reason }, actor) {
      let cancelled = 0;
      for (const req of await repository.pendingForFlow(flowId, keepNodeIds)) {
        if (!(await repository.closeRequest(req.id, { status: 'CANCELLED', decidedBy: actor?.id ?? null, comment: reason }))) continue;
        cancelled += 1;
        if (req.run_id) await repository.finishRun(req.run_id, { status: 'CANCELLED', error: reason });
        const approvers = req.approvers.filter((a) => a.decision === 'PENDING').map((a) => a.user_id);
        const base = { entityType: req.entity_type, entityId: req.entity_id, link: req.link || LINK(req.id), actorId: actor?.id ?? null, type: notificationService.Type.FLOW_APPROVAL_DECIDED };
        if (approvers.length) {
          await notificationService.notify({
            ...base, userIds: approvers, title: `Cancelled: ${req.title}`, body: `No action needed — ${reason}.`,
            email: { eyebrow: 'Cancelled', intro: `“${req.title}” no longer needs your approval — ${reason}.`, actionLabel: 'Open in the portal' },
          });
        }
        if (req.requested_by) {
          await notificationService.notify({
            ...base, userIds: [req.requested_by], title: `Approval request cancelled: ${req.title}`, body: `${reason} — do it again and it follows the flow as it is now.`,
            email: { eyebrow: 'Cancelled', intro: `Your approval request “${req.title}” was cancelled: ${reason}. Do it again in the portal and it follows the flow as it is now.`, actionLabel: 'Open in the portal' },
          });
        }
        await auditService.record({
          action: auditService.Action.UPDATE, entity: 'ApprovalRequest', entityId: req.id, actor,
          changes: { status: { from: 'PENDING', to: 'CANCELLED' }, reason },
        });
      }
      return cancelled;
    },

    /**
     * The pending request holding an action, if any — what locks the figures
     * it was asked on (e.g. an offer's price while its approval waits).
     * @param {{ entityType: string, entityId: number|string, action: string, keyPrefix?: string }} p
     * @returns {Promise<{ id: number, waiting_for: string }|null>}
     */
    async pendingFor({ entityType, entityId, action, keyPrefix }) {
      const req = await repository.pendingRequest({ entityType, entityId, action, keyPrefix });
      if (!req) return null;
      const who = await names(req.approvers.filter((a) => a.decision === 'PENDING').map((a) => a.user_id));
      return {
        id: req.id, action_key: req.action_key, requested_by: req.requested_by, waiting_for: joinNames(who, req.mode),
        can_withdraw: await withdrawable(req),
      };
    },

    /**
     * Where an action stands: its newest request, for showing on the record
     * (waiting / approved and not used yet / rejected with the reason).
     * @param {{ entityType: string, entityId: number|string, action: string, keyPrefix?: string }} p
     * @returns {Promise<object|null>} null when never asked
     */
    async latestFor({ entityType, entityId, action, keyPrefix }) {
      const req = await repository.latestRequest({ entityType, entityId, action, keyPrefix });
      if (!req) return null;
      const pending = req.approvers.filter((a) => a.decision === 'PENDING').map((a) => a.user_id);
      const map = await repository.userNames([req.decided_by, ...pending]);
      return {
        id: req.id, status: req.status, action_key: req.action_key, requested_by: req.requested_by,
        waiting_for: req.status === 'PENDING' ? joinNames(pending.map((id) => map.get(id)).filter(Boolean), req.mode) : null,
        can_withdraw: req.status === 'PENDING' && await withdrawable(req),
        decided_by: map.get(req.decided_by) || null, decided_at: req.decided_at, comment: req.comment, consumed_at: req.consumed_at,
      };
    },

    /** The reminder and escalation sweep (from the flow engine's loop). */
    async sweep(now = new Date()) {
      let reminded = 0; let escalated = 0;
      for (const req of await repository.dueReminders(now)) {
        if (!(await repository.claimReminder(req.id))) continue;
        await tellApprovers(req, req.approvers.filter((a) => a.decision === 'PENDING').map((a) => a.user_id), 'reminder');
        reminded += 1;
      }
      for (const req of await repository.dueEscalations(now)) {
        if (!(await repository.claimEscalation(req.id))) continue;
        const already = new Set(req.approvers.map((a) => a.user_id));
        const admins = (await repository.superAdminIds()).filter((uid) => !already.has(uid));
        await repository.addApprovers(req.id, admins);
        await tellApprovers(req, admins, 'escalated');
        escalated += 1;
      }
      return { reminded, escalated };
    },
  };
}

const approvalsService = createApprovalsService(flowEngineRepository);

module.exports = { approvalsService, createApprovalsService };
