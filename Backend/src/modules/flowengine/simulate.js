const { flowEngineRepository } = require('./flowengine.repository');
const { catalogFor } = require('./catalog');
const { nodeType, render } = require('./nodes');
const { parseGraph, triggerNode, nextNodes } = require('./graph');
const { createHelpers } = require('./helpers');

/**
 * Test run: what a flow's draft would do for one record — without doing it.
 * Each block reports in words: which way an If went, who Assign would pick,
 * who a Notify would reach and with what text, who an Approval would ask. No
 * notification is sent, nobody is assigned, no approval is raised, and "turn
 * by turn" does not take a turn.
 */

const MAX_STEPS = 200;

/**
 * @param {object} p
 * @param {{ id: number, name: string, module: string }} p.flow
 * @param {object} p.graph            the draft
 * @param {number|string} p.entityId  the record to try it on
 * @param {object} [p.payload]        the event's details (e.g. { to: 'COSTING' }, { offer_value_inr })
 * @param {'approved'|'rejected'} [p.assume]  which way an Approval goes (default: stop there)
 */
async function simulate({ flow, graph, entityId, payload = {}, assume }, repository = flowEngineRepository) {
  const helpers = createHelpers(repository);
  const catalog = catalogFor(flow.module);
  const facts = await catalog.loadEntity(entityId);
  if (!facts) return { starts: false, reason: 'No such record', steps: [] };
  const start = triggerNode(graph);
  const type = start?.data?.event;
  const event = { type, payload, actorId: null };
  const stageName = helpers.stageLabel(flow.module);
  if (!nodeType('trigger').matches(start.data, event)) {
    return { starts: false, reason: 'This flow does not start for that stage', facts: { ref_no: facts.ref_no, title: facts.title }, steps: [] };
  }

  const ctx = { mode: 'inline', module: flow.module, event, facts, flow, version: { id: 0, version: 0 }, helpers, dryRun: true };
  const people = async (ids) => {
    const map = await repository.userNames(ids);
    return ids.map((id) => map.get(id) || `#${id}`);
  };
  const steps = [];
  let node = start;
  for (let i = 0; node && i < MAX_STEPS; i += 1) {
    const t = nodeType(node.type);
    const step = { node_id: node.id, type: node.type, label: t?.label || node.type };
    let handle = null;
    if (!t) { step.text = `Unknown block "${node.type}"`; steps.push(step); break; }

    if (node.type === 'trigger') {
      step.text = `Starts: ${catalog.events.find((e) => e.key === type)?.label || type}`;
      handle = 'next';
    } else if (node.type === 'assign') {
      const userId = await helpers.pickAssignee(node, ctx);
      const queued = node.data.to === 'DEPARTMENT' && node.data.pick === 'HEAD_PICKS';
      const [who] = userId ? await people([userId]) : [];
      step.text = userId
        ? `Would go to ${who}${queued ? ' (department head — to assign to the team)' : ''}`
        : 'Nobody active to give it to — the built-in rule would decide';
      step.result = { user_id: userId };
      handle = 'next';
    } else if (node.type === 'notify') {
      const ids = await helpers.recipients(node.data.to, ctx);
      step.text = ids.length ? `Would notify ${(await people(ids)).join(', ')}` : 'Would notify nobody (no active person matches)';
      step.result = {
        title: render(node.data.title, facts, event, stageName),
        message: render(node.data.message, facts, event, stageName),
      };
      handle = 'next';
    } else if (node.type === 'approval') {
      let ids = await helpers.recipients(node.data.to, ctx);
      const toAdmins = !ids.length;
      if (toAdmins) ids = await repository.superAdminIds();
      step.text = `Would hold it for approval by ${(await people(ids)).join(node.data.mode === 'ALL' ? ' and ' : ' or ')}${toAdmins ? ' (nobody named is active — the Super Admins)' : ''}`;
      handle = assume || null;
      if (assume) step.text += ` — trying the ${assume === 'approved' ? 'Approved' : 'Rejected'} way`;
    } else {
      const r = await t.run(ctx, node);
      handle = r?.handle ?? null;
      if (node.type === 'if') step.text = r.output?.result ? 'Yes — the conditions are met' : 'No — the conditions are not met';
      else if (node.type === 'stage_switch') {
        const group = (node.data.cases || []).find((c) => c.id === handle);
        step.text = group ? `${stageName(r.output?.stage)} → “${group.label || group.id}”` : `${stageName(r.output?.stage) || 'This stage'} → other`;
      } else if (node.type === 'end') step.text = 'Ends';
    }
    step.handle = handle;
    steps.push(step);
    if (!handle) break;
    [node] = nextNodes(graph, node.id, handle);
    if (!node) steps.push({ node_id: null, type: 'end', label: 'End', text: `Nothing connected to “${handle}” — the flow ends here` });
  }
  return { starts: true, facts: { ref_no: facts.ref_no, title: facts.title, stage: stageName(facts.stage) }, steps };
}

module.exports = { simulate };
