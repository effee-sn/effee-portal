const { flowEngineRepository } = require('./flowengine.repository');
const { catalogFor, publicCatalog, MODULES } = require('./catalog');
const { nodeType, NODE_TYPES } = require('./nodes');
const { parseGraph, validateGraph, triggerNode, assignNodes } = require('./graph');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ConflictError, ValidationError } = require('../../core');

/**
 * Flow Builder flows: create, edit the draft canvas, check, publish (a new
 * frozen version that becomes the live one), pause and resume, and read the
 * run log. Publishing never changes a run already going — runs keep the
 * version they started with.
 *
 * @param {ReturnType<typeof import('./flowengine.repository').createFlowEngineRepository>} repository
 */
function createFlowEngineService(repository) {
  const shape = (flow) => {
    if (!flow) return flow;
    const { draft_graph, ...rest } = flow;
    return draft_graph === undefined ? rest : { ...rest, draft_graph: parseGraph(draft_graph) };
  };

  async function load(id) {
    const flow = await repository.findFlow(id);
    if (!flow) throw new NotFoundError('Flow');
    return flow;
  }

  function assertModule(module) {
    if (!catalogFor(module)) {
      throw new ValidationError('Validation failed', [{ field: 'module', message: `Flows are available for: ${MODULES.join(', ')}` }]);
    }
  }

  /** Problems with a flow's canvas, checked against its module's catalog. */
  function problems(flow, graph) {
    return validateGraph(graph, { catalog: catalogFor(flow.module), nodeType });
  }

  /** The stages an assigning flow covers: the ones its When block names, or all. */
  function coveredStages(module, graph) {
    const stages = triggerNode(graph)?.data?.stages;
    return Array.isArray(stages) && stages.length ? stages : catalogFor(module).stages.map((s) => s.key);
  }

  /**
   * Refuses a flow that names someone or something gone (or, for a person,
   * inactive), or that would assign a stage another live flow already assigns —
   * two flows deciding the same stage would give a random answer.
   */
  async function assertCanGoLive(flow, graph) {
    const refs = graph.nodes.flatMap((n) => nodeType(n.type)?.refs?.(n.data || {}) || []);
    const missing = await repository.missingRefs(refs);
    if (missing.length) {
      const what = { user: 'person (inactive or removed)', department: 'department (removed)', role: 'role (removed)' };
      throw new ValidationError('The flow names something that no longer exists', missing.map((m) => ({
        field: graph.nodes.find((n) => (nodeType(n.type)?.refs?.(n.data || {}) || []).some((r) => r.kind === m.kind && r.id === m.id))?.id || 'flow',
        message: `A block names a ${what[m.kind]} — choose another`,
      })));
    }
    if (!assignNodes(graph, nodeType).length) return;
    const mine = new Set(coveredStages(flow.module, graph));
    for (const other of await repository.liveFlowsFor(flow.module, 'STAGE_ENTERED')) {
      if (other.flow.id === flow.id) continue;
      const g = parseGraph(other.version.graph);
      if (!g || !assignNodes(g, nodeType).length) continue;
      const clash = coveredStages(flow.module, g).filter((s) => mine.has(s));
      if (clash.length) {
        const labels = clash.map((s) => catalogFor(flow.module).stages.find((x) => x.key === s)?.label || s);
        throw new ConflictError(`“${other.flow.name}” already assigns ${labels.join(', ')} — one flow decides who gets each stage. Change its stages, or pause it first.`);
      }
    }
  }

  return {
    /** What the builder offers for a module: events, stages, fields, words and blocks. */
    catalog(module) {
      assertModule(module);
      const blocks = Object.values(NODE_TYPES).map((t) => ({
        type: t.type, label: t.label, handles: t.handlesFor ? null : t.handles, ...(t.onlyFor ? { onlyFor: t.onlyFor } : {}),
      }));
      return { ...publicCatalog(module), blocks };
    },

    async list({ module, status, skip, take }) {
      const where = {};
      if (module) where.module = module;
      if (status) where.status = status;
      return repository.findFlows({ where, skip, take });
    },

    async getById(id) {
      const flow = await load(id);
      const versions = await repository.listVersions(id);
      return { ...shape(flow), versions };
    },

    async create(dto, actor) {
      assertModule(dto.module);
      const flow = await repository.createFlow({
        module: dto.module,
        name: dto.name,
        description: dto.description ?? null,
        draft_graph: dto.graph ? JSON.stringify(dto.graph) : null,
        created_by: actor?.id ?? null,
        updated_by: actor?.id ?? null,
      });
      await auditService.record({
        action: auditService.Action.CREATE, entity: 'FlowDefinition', entityId: flow.id, actor,
        changes: { module: flow.module, name: flow.name },
      });
      return shape(flow);
    },

    /** Saves the name, description and/or the draft canvas. The live version is untouched. */
    async update(id, dto, actor) {
      const before = await load(id);
      const data = { updated_by: actor?.id ?? null };
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.graph !== undefined) data.draft_graph = dto.graph === null ? null : JSON.stringify(dto.graph);
      const flow = await repository.updateFlow(id, data);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'FlowDefinition', entityId: id, actor,
        changes: {
          ...(dto.name !== undefined && dto.name !== before.name ? { name: { from: before.name, to: dto.name } } : {}),
          ...(dto.description !== undefined ? { description: true } : {}),
          ...(dto.graph !== undefined ? { draft_saved: true } : {}),
        },
      });
      return shape(flow);
    },

    /** The draft's problems — what would stop it being published. */
    async check(id) {
      const flow = await load(id);
      const errors = problems(flow, parseGraph(flow.draft_graph));
      return { ok: errors.length === 0, errors };
    },

    /**
     * Freezes the draft as the next version and makes it live (and the flow
     * Active). Refused while the draft has problems.
     */
    async publish(id, actor) {
      const flow = await load(id);
      const graph = parseGraph(flow.draft_graph);
      const errors = problems(flow, graph);
      if (errors.length) {
        throw new ValidationError('The flow has problems to fix before publishing', errors.map((e) => ({ field: e.nodeId || 'flow', message: e.message })));
      }
      await assertCanGoLive(flow, graph);
      const version = (await repository.lastVersionNo(id)) + 1;
      const trigger = triggerNode(graph).data.event;
      let result;
      try {
        result = await repository.publish(id, { version, graph: JSON.stringify(graph), trigger, actorId: actor?.id ?? null });
      } catch (err) {
        if (err.code === 'P2002') throw new ConflictError('Someone else published this flow just now — reload and try again');
        throw err;
      }
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'FlowDefinition', entityId: id, actor,
        changes: { published: { version, trigger }, status: { from: flow.status, to: 'ACTIVE' } },
      });
      return { ...shape(result.flow), published: result.version };
    },

    /** Stops the live version starting new runs (runs already going finish). */
    async pause(id, actor) {
      const flow = await load(id);
      if (flow.status !== 'ACTIVE') throw new ConflictError('Only an active flow can be paused');
      const updated = await repository.updateFlow(id, { status: 'PAUSED', updated_by: actor?.id ?? null });
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'FlowDefinition', entityId: id, actor, changes: { status: { from: 'ACTIVE', to: 'PAUSED' } } });
      return shape(updated);
    },

    async resume(id, actor) {
      const flow = await load(id);
      if (flow.status !== 'PAUSED') throw new ConflictError('Only a paused flow can be resumed');
      // What was fine when published may not be now (someone left, another flow took a stage).
      const live = await repository.findVersion(flow.live_version_id);
      await assertCanGoLive(flow, parseGraph(live.graph));
      const updated = await repository.updateFlow(id, { status: 'ACTIVE', updated_by: actor?.id ?? null });
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'FlowDefinition', entityId: id, actor, changes: { status: { from: 'PAUSED', to: 'ACTIVE' } } });
      return shape(updated);
    },

    /** Removes a flow (soft). It must be paused or never published, so nothing live disappears by accident. */
    async remove(id, actor) {
      const flow = await load(id);
      if (flow.status === 'ACTIVE') throw new ConflictError('Pause the flow before deleting it');
      await repository.updateFlow(id, { deleted_at: new Date(), updated_by: actor?.id ?? null });
      await auditService.record({ action: auditService.Action.DELETE, entity: 'FlowDefinition', entityId: id, actor, changes: { name: flow.name, soft_deleted: true } });
    },

    /** A published version's canvas. */
    async getVersion(flowId, versionId) {
      await load(flowId);
      const v = await repository.findVersion(versionId);
      if (!v || v.flow_id !== flowId) throw new NotFoundError('Flow version');
      return { ...v, graph: parseGraph(v.graph) };
    },

    /** The run log: a flow's runs, or every run on one record. */
    async runs({ flowId, entityType, entityId, skip, take }) {
      const where = {};
      if (flowId) where.flow_id = flowId;
      if (entityType) where.entity_type = entityType;
      if (entityId) where.entity_id = String(entityId);
      return repository.findRuns({ where, skip, take });
    },

    async getRun(id) {
      const run = await repository.findRun(id);
      if (!run) throw new NotFoundError('Flow run');
      return { ...run, steps: run.steps.map((s) => ({ ...s, output: s.output ? JSON.parse(s.output) : null })) };
    },
  };
}

const flowEngineService = createFlowEngineService(flowEngineRepository);

module.exports = { flowEngineService, createFlowEngineService };
