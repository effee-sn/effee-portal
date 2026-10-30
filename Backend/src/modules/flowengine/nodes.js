const { testConditions, validateConditions, factOf } = require('./conditions');

/**
 * The blocks a flow is built from. Each block type declares:
 *   - `handles` (or `handlesFor(data)`): the arrows that can leave it,
 *   - `validate(data, catalog, event)`: what is wrong with its settings (publish
 *     refuses a flow with any); `event` is the flow's trigger event,
 *   - `refs(data)`: people / departments / roles it names, checked to exist and
 *     be active when publishing,
 *   - `run(ctx, node)`: what it does, returning the arrow to follow (`null` to stop).
 *
 * Blocks run in two modes (ctx.mode):
 *   - `run`    — the background run after an event (notifications go out),
 *   - `inline` — at the moment of a stage move, only to answer "who gets it"
 *                (nothing is sent; it stops at the Assign block).
 * The work that touches the database is done by helpers on `ctx`, so these
 * definitions stay pure.
 */

/** Events whose trigger can be narrowed to some stages. */
const STAGE_EVENTS = Object.freeze({ STAGE_ENTERED: 'to', STAGE_STALLED: 'stage', BEFORE_STAGE_MOVE: 'to' });

/** The "Before …" events: a flow on one runs at the moment of the action and can hold it. */
const GUARD_EVENTS = Object.freeze(['BEFORE_STAGE_MOVE', 'BEFORE_OFFER_SENT', 'BEFORE_WON', 'BEFORE_LOST', 'BEFORE_REOPEN']);

const isId = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

/**
 * The stage a block sees: the stage being entered — just entered (STAGE_ENTERED)
 * or about to be (BEFORE_STAGE_MOVE) — for a stage event; else the record's.
 */
function currentStage(ctx) {
  const type = ctx.event?.type;
  return type === 'STAGE_ENTERED' || type === 'BEFORE_STAGE_MOVE' ? ctx.event.payload?.to : ctx.facts?.stage;
}

// ── When ─────────────────────────────────────────────────────────────────────
const trigger = Object.freeze({
  type: 'trigger',
  label: 'When',
  handles: ['next'],
  validate(data, catalog) {
    const errors = [];
    const event = catalog.events.find((e) => e.key === data?.event);
    if (!event) errors.push('choose what starts the flow');
    if (data?.stages !== undefined) {
      if (!Array.isArray(data.stages) || !data.stages.length) errors.push('choose at least one stage, or none to mean any');
      else if (!STAGE_EVENTS[data.event]) errors.push('stages can only narrow a stage event');
      else {
        const known = new Set(catalog.stages.map((s) => s.key));
        const unknown = data.stages.filter((s) => !known.has(s));
        if (unknown.length) errors.push(`unknown stage: ${unknown.join(', ')}`);
      }
    }
    return errors;
  },
  /** Does this event start the flow (the event type matched already)? */
  matches(data, event) {
    const field = STAGE_EVENTS[event.type];
    if (!field || !Array.isArray(data?.stages) || !data.stages.length) return true;
    return data.stages.includes(event.payload?.[field]);
  },
  async run() {
    return { handle: 'next' };
  },
});

// ── End ──────────────────────────────────────────────────────────────────────
const end = Object.freeze({
  type: 'end',
  label: 'End',
  handles: [],
  validate() { return []; },
  async run() {
    return { handle: null };
  },
});

// ── If ───────────────────────────────────────────────────────────────────────
const condition = Object.freeze({
  type: 'if',
  label: 'If',
  handles: ['yes', 'no'],
  validate(data, catalog, event) {
    return validateConditions(data, catalog, event);
  },
  async run(ctx, node) {
    if (!ctx.facts) throw new Error('The record this flow is about no longer exists');
    const facts = { ...ctx.facts, stage: currentStage(ctx) ?? ctx.facts.stage };
    const yes = testConditions(node.data, facts, ctx.event);
    return { handle: yes ? 'yes' : 'no', output: { result: yes } };
  },
});

// ── Which stage? ─────────────────────────────────────────────────────────────
const stageSwitch = Object.freeze({
  type: 'stage_switch',
  label: 'Which stage?',
  /** One way out per case, plus `other` for every stage no case names. */
  handlesFor(data) {
    return [...(Array.isArray(data?.cases) ? data.cases.map((c) => c?.id).filter(Boolean) : []), 'other'];
  },
  validate(data, catalog) {
    const errors = [];
    const cases = data?.cases;
    if (!Array.isArray(cases) || !cases.length) return ['add at least one stage group'];
    const known = new Set(catalog.stages.map((s) => s.key));
    const seenIds = new Set(); const seenStages = new Set();
    cases.forEach((c, i) => {
      const n = `group ${i + 1}`;
      if (!c?.id || typeof c.id !== 'string' || c.id === 'other' || c.id === 'next') errors.push(`${n}: needs an id`);
      else if (seenIds.has(c.id)) errors.push(`${n}: two groups share an id`);
      else seenIds.add(c.id);
      if (!Array.isArray(c?.stages) || !c.stages.length) { errors.push(`${n}: choose at least one stage`); return; }
      for (const s of c.stages) {
        if (!known.has(s)) errors.push(`${n}: unknown stage ${s}`);
        else if (seenStages.has(s)) errors.push(`${n}: ${s} is already in another group`);
        else seenStages.add(s);
      }
    });
    return errors;
  },
  async run(ctx, node) {
    const stage = currentStage(ctx);
    const hit = (node.data.cases || []).find((c) => c.stages.includes(stage));
    return { handle: hit ? hit.id : 'other', output: { stage } };
  },
});

// ── Assign ───────────────────────────────────────────────────────────────────
// SETUP_HANDLER: the person the module's Setup names (Sales: the Internal Sales person).
const ASSIGN_TO = Object.freeze(['PERSON', 'DEPARTMENT', 'ROLE', 'OWNER', 'CREATOR', 'SAME_AS_STAGE', 'SETUP_HANDLER']);
// HEAD_PICKS: the department head holds it and assigns it to a member (the queue).
const DEPARTMENT_PICK = Object.freeze(['HEAD', 'HEAD_PICKS', 'LEAST_BUSY', 'TURN']);
const ROLE_PICK = Object.freeze(['LEAST_BUSY', 'TURN']);

const assign = Object.freeze({
  type: 'assign',
  label: 'Assign',
  handles: ['next'],
  /** Only in a flow started by entering a stage — it decides who holds the record there. */
  onlyFor: ['STAGE_ENTERED'],
  assigns: true,
  validate(data, catalog) {
    const to = data?.to;
    if (!ASSIGN_TO.includes(to)) return ['choose who to assign to'];
    if (to === 'PERSON' && !isId(data.user_id)) return ['choose the person'];
    if (to === 'DEPARTMENT') {
      if (!isId(data.department_id)) return ['choose the department'];
      if (!DEPARTMENT_PICK.includes(data.pick)) return ['choose who in the department gets it'];
    }
    if (to === 'ROLE') {
      if (!isId(data.role_id)) return ['choose the role'];
      if (!ROLE_PICK.includes(data.pick)) return ['choose who with that role gets it'];
    }
    if (to === 'SAME_AS_STAGE' && !catalog.stages.some((s) => s.key === data.stage)) return ['choose the earlier stage'];
    return [];
  },
  refs(data) {
    if (data?.to === 'PERSON') return [{ kind: 'user', id: Number(data.user_id) }];
    if (data?.to === 'DEPARTMENT') return [{ kind: 'department', id: Number(data.department_id) }];
    if (data?.to === 'ROLE') return [{ kind: 'role', id: Number(data.role_id) }];
    return [];
  },
  async run(ctx, node) {
    if (ctx.mode === 'inline') {
      // Answer "who gets it" and stop: the rest of the flow is the background run's.
      const queued = node.data.to === 'DEPARTMENT' && node.data.pick === 'HEAD_PICKS';
      ctx.assigned = {
        userId: await ctx.helpers.pickAssignee(node, ctx),
        nodeId: node.id,
        // Waiting for the head to pick a member.
        departmentId: queued ? Number(node.data.department_id) : null,
      };
      return { handle: null };
    }
    // The stage move already assigned it (inline); the run log records who holds it.
    return { handle: 'next', output: { handler_id: ctx.facts?.handler_id ?? null } };
  },
});

// ── Notify ───────────────────────────────────────────────────────────────────
const NOTIFY_TO = Object.freeze(['OWNER', 'HANDLER', 'CREATOR', 'PERSON', 'ROLE', 'DEPARTMENT_HEAD', 'DEPARTMENT']);
const WORD = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Fills {{words}} in a message from the record and the event.
 * @param {(stage: string) => string} [stageLabel]  shows event stages by name
 */
function render(text, facts, event, stageLabel = (s) => s) {
  return String(text || '').replace(WORD, (_, key) => {
    const v = factOf(key, facts, event);
    if (v === null || v === undefined || v === '') return '—';
    if (/_inr$/.test(key)) return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    if (/_pct$/.test(key)) return `${v}%`;
    if (key === 'event.from' || key === 'event.to') return stageLabel(v);
    return String(v);
  });
}

/** What is wrong with a list of people (Notify recipients, Approval approvers). */
function validatePeople(to, noun, emptyMessage) {
  const errors = [];
  if (!Array.isArray(to) || !to.length) return [emptyMessage];
  to.forEach((r, i) => {
    if (!NOTIFY_TO.includes(r?.who)) errors.push(`${noun} ${i + 1}: choose who`);
    else if (['PERSON', 'ROLE', 'DEPARTMENT_HEAD', 'DEPARTMENT'].includes(r.who) && !isId(r.id)) errors.push(`${noun} ${i + 1}: choose from the list`);
  });
  return errors;
}

/** The people, roles and departments a list names (checked when publishing). */
function peopleRefs(to) {
  const kind = { PERSON: 'user', ROLE: 'role', DEPARTMENT_HEAD: 'department', DEPARTMENT: 'department' };
  return (Array.isArray(to) ? to : []).filter((r) => kind[r?.who]).map((r) => ({ kind: kind[r.who], id: Number(r.id) }));
}

const notify = Object.freeze({
  type: 'notify',
  label: 'Notify',
  handles: ['next'],
  validate(data, catalog) {
    const errors = validatePeople(data?.to, 'recipient', 'choose who to notify');
    const title = String(data?.title || '').trim();
    if (!title) errors.push('write a title');
    else if (title.length > 150) errors.push('the title is too long (150 characters at most)');
    if (String(data?.message || '').length > 1000) errors.push('the message is too long (1000 characters at most)');
    const words = new Set(catalog.words);
    const unknown = [...`${data?.title || ''} ${data?.message || ''}`.matchAll(WORD)].map((m) => m[1]).filter((w) => !words.has(w));
    if (unknown.length) errors.push(`unknown word${unknown.length > 1 ? 's' : ''}: ${[...new Set(unknown)].map((w) => `{{${w}}}`).join(', ')}`);
    return errors;
  },
  refs(data) {
    return peopleRefs(data?.to);
  },
  async run(ctx, node) {
    if (ctx.mode === 'inline') return { handle: 'next' };
    if (!ctx.facts) throw new Error('The record this flow is about no longer exists');
    const userIds = await ctx.helpers.recipients(node.data.to, ctx);
    const title = render(node.data.title, ctx.facts, ctx.event, ctx.helpers.stageLabel(ctx.module));
    const message = render(node.data.message, ctx.facts, ctx.event, ctx.helpers.stageLabel(ctx.module));
    await ctx.helpers.notify({ userIds, title, message, ctx });
    return { handle: 'next', output: { sent_to: userIds } };
  },
});

// ── Approval ─────────────────────────────────────────────────────────────────
/**
 * Holds the action until approved. It is decided by the guard (see guard.js) at
 * the moment of the action — never by the background runner, which stops here
 * if it ever meets one (the rest of the path runs once someone decides).
 */
const approval = Object.freeze({
  type: 'approval',
  label: 'Approval',
  handles: ['approved', 'rejected', 'withdrawn'],
  onlyFor: GUARD_EVENTS,
  isApproval: true,
  validate(data) {
    const errors = validatePeople(data?.to, 'approver', 'choose who approves');
    if (data?.mode !== undefined && !['ANY', 'ALL'].includes(data.mode)) errors.push('choose whether any one or all must approve');
    const hours = (v, min, max) => v === undefined || (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max);
    if (!hours(data?.remind_hours, 1, 168)) errors.push('remind after 1 to 168 hours');
    if (!hours(data?.escalate_hours, 1, 720)) errors.push('escalate after 1 to 720 hours');
    return errors;
  },
  refs(data) {
    return peopleRefs(data?.to);
  },
  async run() {
    return { handle: null, output: { waiting: true } };
  },
});

const NODE_TYPES = Object.freeze({ trigger, end, if: condition, stage_switch: stageSwitch, assign, notify, approval });

/** @param {string} type */
function nodeType(type) {
  return Object.prototype.hasOwnProperty.call(NODE_TYPES, type) ? NODE_TYPES[type] : null;
}

/** The ways out of a block with these settings. */
function handlesOf(type, data) {
  return type.handlesFor ? type.handlesFor(data) : type.handles;
}

module.exports = { NODE_TYPES, nodeType, handlesOf, render, ASSIGN_TO, DEPARTMENT_PICK, ROLE_PICK, NOTIFY_TO, GUARD_EVENTS };
