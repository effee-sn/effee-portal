const { flowEngineRepository } = require('./flowengine.repository');
const { catalogFor, publicCatalog, MODULES } = require('./catalog');
const { nodeType, NODE_TYPES } = require('./nodes');
const { parseGraph, validateGraph, triggerNode, assignNodes } = require('./graph');
const { assigneeFromFlows } = require('./assignment');
const { simulate } = require('./simulate');
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

  /** What needs fixing in a live version — people who left, departments / roles removed. */
  async function attentionOf(live) {
    const graph = live && parseGraph(live.graph);
    if (!graph) return [];
    const refs = graph.nodes.flatMap((n) => nodeType(n.type)?.refs?.(n.data || {}) || []);
    const missing = await repository.missingRefs(refs);
    if (!missing.length) return [];
    const names = await repository.userNames(missing.filter((m) => m.kind === 'user').map((m) => m.id));
    return missing.map((m) => (m.kind === 'user'
      ? `${names.get(m.id) || `Person #${m.id}`} is inactive or removed — the built-in rule decides instead`
      : `A ${m.kind} it names was removed`));
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
      const page = await repository.findFlows({ where, skip, take });
      // What each starts on, and anything needing attention (e.g. someone named has left).
      const items = await Promise.all(page.items.map(async (f) => {
        const live = f.live_version_id ? await repository.findVersion(f.live_version_id) : null;
        return { ...f, trigger: live?.trigger ?? null, live_version: live?.version ?? null, attention: await attentionOf(live) };
      }));
      return { ...page, items };
    },

    async getById(id) {
      const flow = await load(id);
      const versions = await repository.listVersions(id);
      const live = flow.live_version_id ? await repository.findVersion(flow.live_version_id) : null;
      return { ...shape(flow), versions, attention: await attentionOf(live) };
    },

    /**
     * Test run of the draft on one record: what each block would do — nothing
     * is sent, assigned or asked.
     * @param {number} id
     * @param {{ entity_id: number|string, payload?: object, assume?: 'approved'|'rejected' }} dto
     */
    async test(id, dto) {
      const flow = await load(id);
      const graph = parseGraph(flow.draft_graph);
      const errors = problems(flow, graph);
      if (errors.length) {
        throw new ValidationError('Fix the flow’s problems first', errors.map((e) => ({ field: e.nodeId || 'flow', message: e.message })));
      }
      return simulate({ flow, graph, entityId: dto.entity_id, payload: dto.payload || {}, assume: dto.assume });
    },

    /**
     * After publishing an assigning flow: the open records at its stages that
     * the new rule would hand to someone else. Nothing moves unless chosen
     * (moveCurrent). "Turn by turn" shows the next person for each; moving
     * shares them out in turn.
     */
    async affected(id) {
      const flow = await load(id);
      if (flow.status !== 'ACTIVE' || !flow.live_version_id) return { items: [] };
      const live = await repository.findVersion(flow.live_version_id);
      const graph = parseGraph(live.graph);
      if (!graph || live.trigger !== 'STAGE_ENTERED' || !assignNodes(graph, nodeType).length) return { items: [] };
      const catalog = catalogFor(flow.module);
      const stages = coveredStages(flow.module, graph).filter((s) => s !== 'WON' && s !== 'LOST');
      const records = await catalog.openRecordsAt(stages);
      const items = [];
      for (const r of records.slice(0, 500)) {
        const next = await assigneeFromFlows({ module: flow.module, stage: r.stage, entity: { id: r.id, owner_id: r.owner_id }, dryRun: true });
        if (!next) continue;
        if (next.userId === r.handler_id && (next.departmentId || null) === (r.queue_department_id || null)) continue;
        items.push({ id: r.id, ref_no: r.ref_no, title: r.title, customer: r.customer?.name ?? null, stage: r.stage, current_id: r.handler_id, current: r.handler?.name ?? null, next_id: next.userId, queued: Boolean(next.departmentId) });
      }
      const names = await repository.userNames(items.map((x) => x.next_id));
      return { items: items.map((x) => ({ ...x, next: names.get(x.next_id) || null })) };
    },

    /** Moves the chosen open records to who the live flow now assigns. */
    async moveCurrent(id, dto, actor) {
      const flow = await load(id);
      if (flow.status !== 'ACTIVE') throw new ConflictError('Only an active flow can move current records');
      const live = await repository.findVersion(flow.live_version_id);
      const catalog = catalogFor(flow.module);
      const affected = new Map((await this.affected(id)).items.map((x) => [x.id, x]));
      let moved = 0; let skipped = 0;
      for (const entityId of dto.entity_ids) {
        const rec = affected.get(entityId);
        if (!rec) { skipped += 1; continue; } // already right, closed, or not at the flow's stages
        const next = await assigneeFromFlows({ module: flow.module, stage: rec.stage, entity: { id: rec.id } });
        if (!next) { skipped += 1; continue; }
        await catalog.applyAssignment(rec.id, next, actor, `moved by the flow change “${flow.name}” (v${live.version})`);
        moved += 1;
      }
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'FlowDefinition', entityId: id, actor, changes: { moved_current: moved, skipped },
      });
      return { moved, skipped };
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

    /** The run log: a flow's runs, or every run on one record — with each record's reference. */
    async runs({ flowId, entityType, entityId, skip, take }) {
      const where = {};
      if (flowId) where.flow_id = flowId;
      if (entityType) where.entity_type = entityType;
      if (entityId) where.entity_id = String(entityId);
      const page = await repository.findRuns({ where, skip, take });
      const flow = flowId ? await repository.findFlow(flowId) : null;
      const catalog = flow && catalogFor(flow.module);
      const labels = catalog?.labelsFor ? await catalog.labelsFor(page.items.filter((r) => r.entity_type === catalog.entityType).map((r) => r.entity_id)) : new Map();
      return { ...page, items: page.items.map((r) => ({ ...r, entity_label: labels.get(String(r.entity_id)) || null })) };
    },

    /**
     * What flows did on one record, in words — for its page: the approvals asked
     * (waiting first) and the runs with their steps ("Assigned to Ravi",
     * "Notified Asha", "Waiting for approval from …").
     * @param {string} module @param {number|string} entityId
     */
    async activityFor(module, entityId) {
      const catalog = catalogFor(module);
      const id = String(entityId);
      const [{ items: runs }, approvals] = await Promise.all([
        repository.findRuns({ where: { entity_type: catalog.entityType, entity_id: id }, skip: 0, take: 30 }),
        repository.findRequests({ where: { entity_type: catalog.entityType, entity_id: id }, skip: 0, take: 20 }),
      ]);
      const flowNames = new Map();
      const graphs = new Map();
      const userIds = new Set(approvals.items.flatMap((a) => [a.requested_by, a.decided_by, ...a.approvers.map((x) => x.user_id)]));
      const detailed = [];
      for (const r of runs) {
        if (!flowNames.has(r.flow_id)) flowNames.set(r.flow_id, (await repository.findFlow(r.flow_id))?.name || 'a flow');
        if (!graphs.has(r.version_id)) graphs.set(r.version_id, parseGraph((await repository.findVersion(r.version_id))?.graph));
        const full = await repository.findRun(r.id);
        for (const s of full.steps) {
          const out = s.output ? JSON.parse(s.output) : {};
          for (const u of [].concat(out.result?.handler_id || [], out.result?.sent_to || [])) userIds.add(u);
        }
        detailed.push(full);
      }
      const names = await repository.userNames([...userIds].filter(Boolean));
      const who = (uid) => names.get(uid) || 'someone';
      const ev = (k) => catalog.events.find((e) => e.key === k)?.label || k;
      const say = (s, graph) => {
        const out = s.output ? JSON.parse(s.output) : {};
        if (s.status === 'FAILED') return `Failed: ${s.error}`;
        switch (s.node_type) {
          case 'if': return `If → ${out.handle === 'yes' ? 'Yes' : 'No'}`;
          case 'stage_switch': {
            const c = graph?.nodes.find((n) => n.id === s.node_id)?.data?.cases?.find((x) => x.id === out.handle);
            return `Which stage? → ${c ? c.label || c.id : 'Other'}`;
          }
          case 'assign': return out.result?.handler_id ? `Assigned to ${who(out.result.handler_id)}` : 'Assigned by the built-in rule';
          case 'notify': return out.result?.sent_to?.length ? `Notified ${out.result.sent_to.map(who).join(', ')}` : 'Notified nobody (no active person matched)';
          case 'approval': {
            const st = out.result?.status;
            return st === 'WAITING' ? 'Held for approval' : st === 'APPROVED' ? 'Approved' : st === 'REJECTED' ? `Rejected${out.result?.comment ? ` — “${out.result.comment}”` : ''}` : 'Approval';
          }
          default: return null;
        }
      };
      return {
        // Waiting ones first, newest first within each.
        approvals: [...approvals.items].sort((a, b) => (b.status === 'PENDING') - (a.status === 'PENDING'))
          .map((a) => ({
            id: a.id, title: a.title, status: a.status, created_at: a.created_at, decided_at: a.decided_at, comment: a.comment, consumed_at: a.consumed_at,
            requested_by: names.get(a.requested_by) || null, decided_by: names.get(a.decided_by) || null,
            waiting_for: a.approvers.filter((x) => x.decision === 'PENDING').map((x) => who(x.user_id)),
          })),
        runs: detailed.map((r) => ({
          id: r.id, flow_id: r.flow_id, flow: flowNames.get(r.flow_id), version: r.version?.version, trigger: ev(r.trigger), status: r.status,
          started_at: r.started_at, error: r.error,
          steps: r.steps.map((s) => say(s, graphs.get(r.version_id))).filter(Boolean),
        })),
      };
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
