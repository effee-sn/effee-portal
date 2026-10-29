const { z } = require('zod');
const { schemas } = require('../../core');
const { MAX_NODES } = require('./graph');

/**
 * Request schemas for Flow Builder flows. These shape and bound the input; the
 * flow's own rules (one When block, no loops, known events …) are checked by
 * the graph rules when a flow is checked or published.
 */

const node = z.object({
  id: z.string().trim().min(1).max(60),
  type: z.string().trim().min(1).max(30),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const edge = z.object({
  id: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(60),
  target: z.string().trim().min(1).max(60),
  sourceHandle: z.string().trim().max(40).nullish(),
});

const graph = z.object({
  nodes: z.array(node).max(MAX_NODES),
  edges: z.array(edge).max(MAX_NODES * 4),
});

const flowModule = z.string().trim().toUpperCase().max(30);
const optionalText = z.string().trim().max(1000).nullish().transform((v) => (v === '' ? null : v));

const moduleParam = z.object({ module: flowModule });
const flowIdParam = schemas.idParam;
const versionParam = z.object({ id: z.coerce.number().int().positive(), versionId: z.coerce.number().int().positive() });

const listFlowsQuery = schemas.listQuery.extend({
  module: flowModule.optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED']).optional(),
});

const listRunsQuery = schemas.listQuery.extend({
  flow_id: z.coerce.number().int().positive().optional(),
  entity_type: z.string().trim().max(40).optional(),
  entity_id: z.string().trim().max(40).optional(),
});

const createFlowBody = z.object({
  module: flowModule,
  name: z.string().trim().min(1, 'Name is required').max(150),
  description: optionalText,
  graph: graph.optional(),
});

const updateFlowBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150).optional(),
  description: optionalText,
  graph: graph.nullable().optional(),
});

module.exports = {
  moduleParam, flowIdParam, versionParam, listFlowsQuery, listRunsQuery, createFlowBody, updateFlowBody,
};
