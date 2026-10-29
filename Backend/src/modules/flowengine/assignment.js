const { flowEngineRepository } = require('./flowengine.repository');
const { catalogFor } = require('./catalog');
const { nodeType } = require('./nodes');
const { parseGraph, triggerNode, nextNodes, assignNodes } = require('./graph');
const { createHelpers } = require('./helpers');
const { logger } = require('../../core');

/**
 * Who should hold a record when it enters a stage — the one place a module asks.
 *
 * Assigning happens at the moment of the stage move (it decides who may work
 * on the record next), so it is answered here, inline, not by the background
 * run: the live flow started by "enters a stage" that covers this stage is
 * walked through its If / Which stage? blocks to its Assign block, which names
 * the person. Nothing is sent on the way (Notify blocks run later, in the
 * background run). Publishing allows only one assigning flow per stage.
 *
 * Whenever no flow gives a usable answer — none covers the stage, its path has
 * no Assign, the person is inactive, or anything fails — the module's own
 * built-in rule (its `fallback`) decides. So a record is never left with nobody.
 */

const MAX_INLINE_STEPS = 200;
const helpers = createHelpers();

/** Walks a graph in "who gets it" mode until an Assign block answers (or the path ends). */
async function walkInline(graph, ctx) {
  let node = triggerNode(graph);
  for (let i = 0; node && i < MAX_INLINE_STEPS; i += 1) {
    const result = await nodeType(node.type).run(ctx, node);
    if (!result?.handle) return;
    [node] = nextNodes(graph, node.id, result.handle);
  }
}

/**
 * The person a live flow assigns, or null (no flow covers the stage, or its
 * Assign found nobody active).
 * @param {object} p
 * @param {string} p.module
 * @param {string} p.stage
 * @param {object|null} p.entity  the record before the move (with the owner it will have), or a partial one when new
 */
async function assigneeFromFlows({ module, stage, entity }, repository = flowEngineRepository) {
  const catalog = catalogFor(module);
  if (!catalog) return null;
  const event = { type: 'STAGE_ENTERED', payload: { to: stage } };
  for (const { flow, version } of await repository.liveFlowsFor(module, 'STAGE_ENTERED')) {
    const graph = parseGraph(version.graph);
    if (!graph || !assignNodes(graph, nodeType).length) continue;
    if (!nodeType('trigger').matches(triggerNode(graph).data, event)) continue;

    // The record as it will be: loaded fresh, with the new stage and owner.
    const loaded = entity?.id ? await catalog.loadEntity(entity.id) : null;
    const facts = { ...(loaded || {}), ...(entity?.id ? {} : entity || {}), owner_id: entity?.owner_id ?? loaded?.owner_id, stage };
    const ctx = { mode: 'inline', module, event, facts, flow, version: { id: version.id, version: version.version }, helpers };
    await walkInline(graph, ctx);
    // One assigning flow per stage (publish enforces it): its answer, even "nobody", is final.
    if (ctx.assigned) return ctx.assigned.userId || null;
  }
  return null;
}

/**
 * @param {{ module: string, stage: string, entity?: object|null }} q
 * @param {() => Promise<number|null>|number|null} fallback  the module's built-in rule
 * @returns {Promise<number|null>} the user id who should hold it
 */
async function resolveAssignee({ module, stage, entity = null }, fallback) {
  try {
    const userId = await assigneeFromFlows({ module, stage, entity });
    if (userId) return userId;
  } catch (err) {
    logger.error({ err, module, stage, entityId: entity?.id }, 'Flow assignment failed — using the built-in rule');
  }
  return fallback();
}

module.exports = { resolveAssignee, assigneeFromFlows };
