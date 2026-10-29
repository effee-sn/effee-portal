/**
 * The canvas as data, and the rules a flow must meet before it can be
 * published. Pure functions — no database — so the builder, the publish check
 * and the runner all agree.
 *
 * A graph is the canvas's own shape (React Flow):
 *   { nodes: [{ id, type, data, position }], edges: [{ id, source, target, sourceHandle }] }
 * An edge without a sourceHandle leaves by `next`.
 */

const MAX_NODES = 200;

/**
 * JSON text (or an object) → a graph with arrays, or null when it isn't one.
 * @param {string|object|null|undefined} input
 */
function parseGraph(input) {
  let g = input;
  if (typeof input === 'string') {
    try { g = JSON.parse(input); } catch { return null; }
  }
  if (!g || typeof g !== 'object' || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) return null;
  return g;
}

/** The arrow an edge leaves by. */
const handleOf = (edge) => edge.sourceHandle || 'next';

/** The trigger block (the first, if there were several). */
function triggerNode(graph) {
  return graph.nodes.find((n) => n.type === 'trigger') || null;
}

/** The blocks an arrow from `nodeId` by `handle` leads to. */
function nextNodes(graph, nodeId, handle) {
  const ids = graph.edges.filter((e) => e.source === nodeId && handleOf(e) === handle).map((e) => e.target);
  return ids.map((id) => graph.nodes.find((n) => n.id === id)).filter(Boolean);
}

/**
 * Everything wrong with a flow, as { nodeId, message } (nodeId null for the
 * flow as a whole). Empty means it can be published.
 * @param {object|null} graph
 * @param {{ catalog: object, nodeType: (type: string) => object|null }} deps
 * @returns {Array<{ nodeId: string|null, message: string }>}
 */
function validateGraph(graph, { catalog, nodeType }) {
  const errors = [];
  const add = (nodeId, message) => errors.push({ nodeId, message });
  if (!graph) return [{ nodeId: null, message: 'The flow is empty or unreadable' }];
  if (!graph.nodes.length) return [{ nodeId: null, message: 'The flow has no blocks' }];
  if (graph.nodes.length > MAX_NODES) add(null, `A flow can have at most ${MAX_NODES} blocks`);

  const triggers = graph.nodes.filter((n) => n?.type === 'trigger');
  if (triggers.length !== 1) add(null, triggers.length ? 'A flow has exactly one “When” block' : 'Add a “When” block to start the flow');
  const event = triggers[0]?.data?.event;

  // Blocks: ids unique, types known, settings valid, allowed for this event.
  const byId = new Map();
  for (const n of graph.nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) { add(null, 'A block has no id'); continue; }
    if (byId.has(n.id)) { add(n.id, 'Two blocks share this id'); continue; }
    byId.set(n.id, n);
    const t = nodeType(n.type);
    if (!t) { add(n.id, `Unknown block type "${n.type}"`); continue; }
    for (const m of t.validate(n.data || {}, catalog, event)) add(n.id, m);
    if (t.onlyFor && event && !t.onlyFor.includes(event)) {
      const names = t.onlyFor.map((k) => catalog.events.find((x) => x.key === k)?.label || k).join(' / ');
      add(n.id, `“${t.label}” works only in a flow started by “${names}”`);
    }
  }

  // Arrows: between existing blocks, leaving by a way out the block has (one
  // arrow per way out — branching is what If / Which stage? are for), never
  // into the start.
  const used = new Set();
  for (const e of graph.edges) {
    const from = byId.get(e?.source); const to = byId.get(e?.target);
    if (!from || !to) { add(null, 'An arrow connects a block that does not exist'); continue; }
    if (e.source === e.target) { add(e.source, 'A block cannot point to itself'); continue; }
    const t = nodeType(from.type);
    const way = handleOf(e);
    if (t && !(t.handlesFor ? t.handlesFor(from.data || {}) : t.handles).includes(way)) add(from.id, `This block has no “${way}” way out`);
    if (used.has(`${e.source}|${way}`)) add(from.id, `Only one arrow can leave by “${way}”`);
    used.add(`${e.source}|${way}`);
    if (to.type === 'trigger') add(to.id, 'Nothing can lead back into the “When” block');
  }

  if (errors.length) return errors;
  const start = triggers[0];

  // No loops: a flow runs top to bottom (depth-first cycle check).
  const state = new Map(); // id → 1 visiting, 2 done
  const out = (id) => graph.edges.filter((e) => e.source === id).map((e) => e.target);
  let cycleAt = null;
  const visit = (id) => {
    if (cycleAt) return;
    state.set(id, 1);
    for (const next of out(id)) {
      if (state.get(next) === 1) { cycleAt = next; return; }
      if (!state.get(next)) visit(next);
    }
    state.set(id, 2);
  };
  for (const n of graph.nodes) if (!state.get(n.id)) visit(n.id);
  if (cycleAt) add(cycleAt, 'The arrows go round in a loop');

  // Every block reachable from the start.
  const seen = new Set([start.id]);
  const queue = [start.id];
  while (queue.length) {
    for (const next of out(queue.shift())) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  for (const n of graph.nodes) if (!seen.has(n.id)) add(n.id, 'Not connected to the “When” block');

  // A "Before …" flow holds its action with an Approval; anything it sends goes
  // after one (on its Approved / Rejected way), since the action has not happened.
  if (catalog.events.find((x) => x.key === event)?.guard && !cycleAt) {
    if (!graph.nodes.some((n) => nodeType(n.type)?.isApproval)) add(null, 'A “Before …” flow holds the action with an Approval — add one');
    const beforeApproval = new Set([start.id]);
    const q = [start.id];
    while (q.length) {
      for (const next of out(q.shift())) {
        if (beforeApproval.has(next) || nodeType(byId.get(next)?.type)?.isApproval) continue;
        beforeApproval.add(next); q.push(next);
      }
    }
    for (const id of beforeApproval) {
      if (byId.get(id)?.type === 'notify') add(id, 'In a “Before …” flow, Notify goes after an Approval — nothing is sent until someone decides');
    }
  }

  // At most one Assign on any path: a record goes to one person per stage move.
  if (!cycleAt) {
    const memo = new Map();
    const assignsFrom = (id) => {
      if (memo.has(id)) return memo.get(id);
      const self = nodeType(byId.get(id)?.type)?.assigns ? 1 : 0;
      const n = self + Math.max(0, ...out(id).map(assignsFrom));
      memo.set(id, n);
      return n;
    };
    for (const n of graph.nodes) {
      if (nodeType(n.type)?.assigns && assignsFrom(n.id) > 1) add(n.id, 'Another Assign follows this one — one Assign per path');
    }
  }

  return errors;
}

/** Ids of the Assign blocks in a graph. */
function assignNodes(graph, nodeType) {
  return graph.nodes.filter((n) => nodeType(n.type)?.assigns);
}

module.exports = { parseGraph, validateGraph, triggerNode, nextNodes, handleOf, assignNodes, MAX_NODES };
