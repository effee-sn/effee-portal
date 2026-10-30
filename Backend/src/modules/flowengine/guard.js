const { flowEngineRepository } = require('./flowengine.repository');
const { catalogFor } = require('./catalog');
const { nodeType } = require('./nodes');
const { parseGraph, triggerNode, nextNodes } = require('./graph');
const { createHelpers } = require('./helpers');
const { approvalsService } = require('./approvals.service');
const { ConflictError } = require('../../core');

/**
 * The approval check before an action ("Before …" flows). A module calls it at
 * the last moment before doing the action:
 *
 *   const pass = await checkGuard({ ... });   // throws when the action is held
 *   await pass.done();                         // uses up the approvals it relied on (all or none)
 *   try { … do the action … } catch (e) { await pass.release(); throw e; }
 *
 * Each live "Before …" flow for the action is walked through its If / Which
 * stage? blocks. At an Approval block:
 *   - an approved, unused request for this exact action → go on (Approved way);
 *   - one still pending → held: "waiting for approval from …";
 *   - none yet (or the last was rejected) → a request is raised and the action
 *     is held: "needs approval from … — request sent" — unless the person acting
 *     is themselves the approver, which approves it there and then.
 * Nothing is sent from here: Notify blocks run once someone decides.
 */

const MAX_STEPS = 200;
const helpers = createHelpers();

/** Held: the message the person sees (409, code APPROVAL_REQUIRED / APPROVAL_PENDING). */
function held(message, code) {
  return new ConflictError(message, code);
}

/**
 * @param {object} p
 * @param {string} p.module          e.g. SALES
 * @param {string} p.type            the "Before …" event, e.g. BEFORE_OFFER_SENT
 * @param {number|string} p.entityId
 * @param {object} p.payload         event details (e.g. { offer_value_inr })
 * @param {string} p.actionKey       which action exactly (e.g. "OFFER:812", "STAGE:COSTING")
 * @param {object} [p.actor]
 * @returns {Promise<{ done: () => Promise<void> }>}
 */
async function checkGuard({ module, type, entityId, payload = {}, actionKey, actor }, repository = flowEngineRepository) {
  const passed = [];
  const pass = {
    /** Uses up the approvals relied on — call just before doing the action. */
    done: async () => {
      if (!(await repository.consumeRequests(passed))) {
        throw held('That approval was just used for this same action — reload to see where it stands.', 'APPROVAL_USED');
      }
    },
    /** Gives them back when the action then failed. */
    release: async () => { await repository.releaseRequests(passed); },
  };
  const live = await repository.liveFlowsFor(module, type);
  if (!live.length) return pass;

  const catalog = catalogFor(module);
  const event = { type, payload, actorId: actor?.id ?? null };
  const facts = await catalog.loadEntity(entityId);
  if (!facts) return pass;
  const ev = catalog.events.find((e) => e.key === type);

  for (const { flow, version } of live) {
    const graph = parseGraph(version.graph);
    if (!graph || !nodeType('trigger').matches(triggerNode(graph).data, event)) continue;
    const ctx = { mode: 'inline', module, event, facts, flow, version: { id: version.id, version: version.version }, helpers };
    const trail = [];
    let node = triggerNode(graph);
    for (let i = 0; node && i < MAX_STEPS; i += 1) {
      if (nodeType(node.type)?.isApproval) {
        const open = await repository.openRequest({ flowId: flow.id, nodeId: node.id, entityType: catalog.entityType, entityId, actionKey });
        if (open?.status === 'APPROVED') {
          passed.push(open.id);
          trail.push({ node, handle: 'approved' });
          [node] = nextNodes(graph, node.id, 'approved');
          continue;
        }
        if (open?.status === 'PENDING') {
          const waitingFor = await approvalsService.names(open.approvers.filter((a) => a.decision === 'PENDING').map((a) => a.user_id));
          throw held(`Waiting for approval from ${approvalsService.joinNames(waitingFor, open.mode)} (asked ${new Date(open.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}). You'll be notified when it is decided.`, 'APPROVAL_PENDING');
        }
        // Nothing asked yet, or the last answer was no: ask (again).
        const stage = (key) => catalog.stages.find((s) => s.key === key)?.label || key;
        const title = `${ev.action}${type === 'BEFORE_STAGE_MOVE' ? ` ${stage(payload.to)}` : ''} — ${facts.ref_no}`;
        const req = await approvalsService.request({
          module, flow, version, node, entityType: catalog.entityType, entityId, action: type, actionKey,
          title, summary: summaryOf(catalog, facts, type, payload, stage), link: catalog.linkFor(facts.id), payload, actor, ctx, trail,
        });
        if (req.status === 'APPROVED') {
          passed.push(req.id);
          trail.push({ node, handle: 'approved' });
          [node] = nextNodes(graph, node.id, 'approved');
          continue;
        }
        const who = await approvalsService.names(req.approvers.filter((a) => a.decision === 'PENDING').map((a) => a.user_id));
        throw held(`Needs approval from ${approvalsService.joinNames(who, req.mode)} — request sent. You'll be notified when it is decided.`, 'APPROVAL_REQUIRED');
      }
      const result = await nodeType(node.type).run(ctx, node);
      trail.push({ node, handle: result?.handle ?? null });
      if (!result?.handle) break;
      [node] = nextNodes(graph, node.id, result.handle);
    }
  }
  return pass;
}

/** An offer's figures for its approver: costing value, offer, and the margin between them. */
function offerRows(payload, money) {
  const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
  return [
    ['Costing value', money(payload.cost_value_inr) ?? 'not entered'],
    ['Offer', `Rev ${payload.version ?? '—'} · ${money(payload.offer_value_inr) ?? '—'}`],
    ...(payload.margin_inr === null || payload.margin_inr === undefined ? [] : [
      ['Margin', `${money(payload.margin_inr)} — ${pct(payload.margin_pct)} of offer · ${pct(payload.markup_pct)} on cost`],
    ]),
  ];
}

/** What approvers read: the record, and the figures that matter for this action. */
function summaryOf(catalog, facts, type, payload, stage) {
  const money = (v) => (v === null || v === undefined ? null : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  const rows = [
    ...catalog.emailRows(facts),
    ['Value', money(facts.value_inr)],
    ...(type === 'BEFORE_OFFER_SENT' ? offerRows(payload, money) : []),
    ...(type === 'BEFORE_WON' ? [['Order value', money(payload.order_value_inr)]] : []),
    ...(type === 'BEFORE_LOST' ? [['Reason', payload.lost_reason], ['Went to', payload.lost_to]] : []),
    ...(type === 'BEFORE_STAGE_MOVE' ? [['Move', `${stage(payload.from)} → ${stage(payload.to)}`]] : []),
  ];
  return rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}: ${v}`).join('\n');
}

module.exports = { checkGuard };
