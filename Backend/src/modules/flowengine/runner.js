const { triggerNode, nextNodes } = require('./graph');

/**
 * Walks one run of a published flow: from the When block, each block runs and
 * names the arrow to follow; every step is written to the run log. A block
 * that throws fails the run (logged with its error) — it never throws to the
 * caller, so one bad flow cannot stop the others.
 */

const MAX_STEPS = 500; // far above any real flow; stops a runaway

/**
 * @param {object} p
 * @param {ReturnType<typeof import('./flowengine.repository').createFlowEngineRepository>} p.repository
 * @param {(type: string) => object|null} p.nodeType
 * @param {number} p.runId
 * @param {object} p.graph   the version's parsed graph
 * @param {object} p.ctx     what blocks may use: { event, flow, version, emit }
 * @param {object[]} [p.start]  where to begin — the When block, or (continuing a
 *   run after an approval is decided) the blocks after the Approval
 * @returns {Promise<{ status: 'DONE'|'FAILED', error?: string, steps: number }>}
 */
async function executeRun({ repository, nodeType, runId, graph, ctx, start }) {
  const queue = start ? [...start] : [triggerNode(graph)];
  let steps = 0;
  while (queue.length) {
    const node = queue.shift();
    if (++steps > MAX_STEPS) {
      await repository.finishRun(runId, { status: 'FAILED', error: `Stopped after ${MAX_STEPS} steps` });
      return { status: 'FAILED', error: 'too many steps', steps };
    }
    const started_at = new Date();
    try {
      const type = nodeType(node.type);
      if (!type) throw new Error(`Unknown block type "${node.type}"`);
      const result = (await type.run(ctx, node)) || { handle: null };
      await repository.addStep({
        run_id: runId, node_id: node.id, node_type: node.type, status: 'DONE', started_at, ended_at: new Date(),
        output: JSON.stringify({ handle: result.handle ?? null, ...(result.output ? { result: result.output } : {}) }),
      });
      if (result.handle) queue.push(...nextNodes(graph, node.id, result.handle));
    } catch (err) {
      const message = err?.message || String(err);
      await repository.addStep({
        run_id: runId, node_id: node.id, node_type: node.type, status: 'FAILED', started_at, ended_at: new Date(), error: message,
      });
      await repository.finishRun(runId, { status: 'FAILED', error: message });
      return { status: 'FAILED', error: message, steps };
    }
  }
  await repository.finishRun(runId, { status: 'DONE' });
  return { status: 'DONE', steps };
}

module.exports = { executeRun, MAX_STEPS };
