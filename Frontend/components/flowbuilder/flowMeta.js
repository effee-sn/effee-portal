/**
 * Flow Builder — what the canvas needs to know about each block: how it looks,
 * what it starts with, its ways out, and a one-line summary of its settings.
 * The rules themselves (what is allowed, what must be filled in) are the
 * server's: "Check" and "Publish" ask it.
 */

export const BLOCKS = [
  { type: 'trigger', label: 'When', hint: 'What starts the flow', color: '#7C3AED', icon: '⚡' },
  { type: 'stage_switch', label: 'Which stage?', hint: 'A way per group of stages', color: '#0891B2', icon: '◇' },
  { type: 'if', label: 'If', hint: 'Yes / no on conditions', color: '#0891B2', icon: '◆' },
  { type: 'assign', label: 'Assign', hint: 'Who gets it at this stage', color: '#2563EB', icon: '👤' },
  { type: 'approval', label: 'Approval', hint: 'Hold the action until approved', color: '#D97706', icon: '✋' },
  { type: 'notify', label: 'Notify', hint: 'Bell, push and email', color: '#16A34A', icon: '🔔' },
  { type: 'end', label: 'End', hint: 'Finish here', color: '#6B7280', icon: '⏹' },
];
export const BLOCK = Object.fromEntries(BLOCKS.map((b) => [b.type, b]));

/** Events a When block's stages can narrow. */
export const STAGE_EVENTS = ['STAGE_ENTERED', 'STAGE_STALLED', 'BEFORE_STAGE_MOVE'];

export const OPERATORS = {
  eq: 'is', ne: 'is not', gt: 'is more than', gte: 'is at least', lt: 'is less than', lte: 'is at most',
  in: 'is one of', not_in: 'is none of', contains: 'contains', empty: 'is empty', not_empty: 'is not empty',
  is_true: 'is yes', is_false: 'is no',
};
export const OPS_FOR = {
  number: ['gt', 'gte', 'lt', 'lte', 'eq', 'ne', 'empty', 'not_empty'],
  boolean: ['is_true', 'is_false'],
  text: ['eq', 'ne', 'contains', 'empty', 'not_empty'],
  enum: ['eq', 'ne', 'in', 'not_in', 'empty', 'not_empty'],
  stage: ['eq', 'ne', 'in', 'not_in'],
  ref: ['eq', 'ne', 'in', 'not_in', 'empty', 'not_empty'],
};
export const NO_VALUE = ['is_true', 'is_false', 'empty', 'not_empty'];
export const LIST_VALUE = ['in', 'not_in'];

export const ASSIGN_TO = [
  { key: 'PERSON', label: 'A person' },
  { key: 'DEPARTMENT', label: 'A department' },
  { key: 'ROLE', label: 'A role' },
  { key: 'OWNER', label: 'The enquiry owner' },
  { key: 'CREATOR', label: 'Whoever raised it' },
  { key: 'SAME_AS_STAGE', label: 'Same person as at an earlier stage' },
  { key: 'SETUP_HANDLER', label: 'The Internal Sales person (set in Setup)' },
];
export const DEPARTMENT_PICK = [
  { key: 'HEAD_PICKS', label: 'The head picks someone in the team' },
  { key: 'HEAD', label: 'The department head' },
  { key: 'LEAST_BUSY', label: 'The least busy member' },
  { key: 'TURN', label: 'Turn by turn' },
];
export const ROLE_PICK = [
  { key: 'LEAST_BUSY', label: 'The least busy' },
  { key: 'TURN', label: 'Turn by turn' },
];
export const PEOPLE = [
  { key: 'OWNER', label: 'The enquiry owner' },
  { key: 'HANDLER', label: 'Whoever holds it now' },
  { key: 'CREATOR', label: 'Whoever raised it' },
  { key: 'PERSON', label: 'A person', needs: 'user' },
  { key: 'ROLE', label: 'Everyone with a role', needs: 'role' },
  { key: 'DEPARTMENT_HEAD', label: 'A department’s head', needs: 'department' },
  { key: 'DEPARTMENT', label: 'Everyone in a department', needs: 'department' },
];

const rid = () => Math.random().toString(36).slice(2, 8);
export const newId = (type) => `${type}-${rid()}`;

/** A new block's starting settings. */
export function defaultData(type) {
  switch (type) {
    case 'trigger': return { event: 'STAGE_ENTERED' };
    case 'if': return { match: 'all', rules: [{ field: 'value_inr', op: 'gt', value: '' }] };
    case 'stage_switch': return { cases: [{ id: `g${rid()}`, label: 'Group 1', stages: [] }] };
    case 'assign': return { to: 'PERSON' };
    case 'approval': return { to: [{ who: 'PERSON' }], mode: 'ANY', remind_hours: 4, escalate_hours: 24 };
    case 'notify': return { to: [{ who: 'OWNER' }], title: '', message: '' };
    default: return {};
  }
}

/** A block's ways out, with their labels. */
export function waysOut(type, data) {
  switch (type) {
    case 'trigger': case 'assign': case 'notify': return [{ id: 'next', label: '' }];
    case 'if': return [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }];
    case 'approval': return [{ id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }, ...(data?.allow_withdraw === false ? [] : [{ id: 'withdrawn', label: 'Withdrawn' }])];
    case 'stage_switch': return [...(data?.cases || []).map((c) => ({ id: c.id, label: c.label || 'Group' })), { id: 'other', label: 'Other' }];
    default: return [];
  }
}

/** A number field's value in its unit: ₹ for amounts (…_inr), % for percentages (…_pct), plain otherwise (days). */
export function numberText(key, v) {
  if (v === '' || v === undefined || v === null || Number.isNaN(Number(v))) return '…';
  if (/_pct$/.test(key)) return `${Number(v)}%`;
  if (/_inr$/.test(key)) return `₹${Number(v).toLocaleString('en-IN')}`;
  return Number(v).toLocaleString('en-IN');
}

/**
 * One line saying what a block is set to.
 * @param {object} names  { users, departments, roles, applications, customers } — id → name maps
 */
export function summary(type, data, catalog, names) {
  const stage = (k) => catalog?.stages?.find((s) => s.key === k)?.label || k;
  const person = (id) => names.users.get(Number(id)) || 'choose…';
  const dept = (id) => names.departments.get(Number(id)) || 'choose…';
  const role = (id) => names.roles.get(Number(id)) || 'choose…';
  const people = (list) => (list || []).map((r) => {
    if (r.who === 'PERSON') return person(r.id);
    if (r.who === 'ROLE') return `role ${role(r.id)}`;
    if (r.who === 'DEPARTMENT_HEAD') return `head of ${dept(r.id)}`;
    if (r.who === 'DEPARTMENT') return `all in ${dept(r.id)}`;
    return { OWNER: 'owner', HANDLER: 'holder', CREATOR: 'raiser' }[r.who] || '…';
  }).join(', ') || 'choose…';
  switch (type) {
    case 'trigger': {
      const ev = catalog?.events?.find((e) => e.key === data.event);
      const st = data.stages?.length ? ` · ${data.stages.map(stage).join(', ')}` : '';
      return `${ev?.label || 'choose…'}${st}`;
    }
    case 'if': {
      const rules = (data.rules || []).map((r) => {
        const f = catalog?.fields?.find((x) => x.key === r.field);
        if (!f) return '…';
        const v = NO_VALUE.includes(r.op) ? ''
          : f.type === 'number' ? ` ${numberText(f.key, r.value)}`
            : f.type === 'stage' ? ` ${[].concat(r.value || []).map(stage).join(', ')}`
              : f.type === 'enum' ? ` ${[].concat(r.value || []).map((x) => f.options.find((o) => o.key === x)?.label || x).join(', ')}`
                : f.type === 'ref' ? ` ${[].concat(r.value || []).map((x) => (f.ref === 'user' ? person(x) : f.ref === 'application' ? names.applications.get(Number(x)) : names.customers.get(Number(x))) || x).join(', ')}`
                  : ` “${r.value ?? ''}”`;
        return `${f.label.replace(/ —.*$/, '')} ${OPERATORS[r.op] || '…'}${v}`;
      });
      return rules.join(data.match === 'any' ? ' OR ' : ' AND ') || 'add a rule';
    }
    case 'stage_switch': return (data.cases || []).map((c) => `${c.label || 'Group'}: ${(c.stages || []).map(stage).join(', ') || '…'}`).join(' · ');
    case 'assign':
      if (data.to === 'PERSON') return person(data.user_id);
      if (data.to === 'DEPARTMENT') return `${dept(data.department_id)} · ${DEPARTMENT_PICK.find((p) => p.key === data.pick)?.label.toLowerCase() || 'choose who…'}`;
      if (data.to === 'ROLE') return `${role(data.role_id)} · ${ROLE_PICK.find((p) => p.key === data.pick)?.label.toLowerCase() || 'choose who…'}`;
      if (data.to === 'SAME_AS_STAGE') return `Same as at ${data.stage ? stage(data.stage) : '…'}`;
      return ASSIGN_TO.find((a) => a.key === data.to)?.label || 'choose…';
    case 'approval': return `${people(data.to)} · ${data.mode === 'ALL' ? 'all must approve' : 'any one'}${data.allow_withdraw === false ? ' · cannot be withdrawn' : ''}`;
    case 'notify': return `${people(data.to)}${data.title ? ` — “${data.title}”` : ''}`;
    case 'end': return 'Finish';
    default: return '';
  }
}

/** Canvas ↔ saved graph. */
export function toGraph(nodes, edges) {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.data.kind, data: n.data.settings, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.sourceHandle && e.sourceHandle !== 'next' ? { sourceHandle: e.sourceHandle } : {}) })),
  };
}

export function fromGraph(graph) {
  const g = graph?.nodes?.length ? graph : { nodes: [{ id: 'start', type: 'trigger', data: defaultData('trigger'), position: { x: 260, y: 40 } }], edges: [] };
  return {
    nodes: g.nodes.map((n) => ({
      id: n.id, type: 'block', position: n.position || { x: 0, y: 0 }, deletable: n.type !== 'trigger',
      data: { kind: n.type, settings: n.data || {} },
    })),
    edges: g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || 'next' })),
  };
}
