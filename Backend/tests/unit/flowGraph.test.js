/**
 * Flow engine — the rules a flow must meet before publishing, and how the
 * When block decides whether an event starts the flow. Pinned down.
 *
 * Run:  node --test tests/unit/flowGraph.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseGraph, validateGraph, triggerNode, nextNodes } = require('../../src/modules/flowengine/graph');
const { nodeType, render } = require('../../src/modules/flowengine/nodes');
const { catalogFor } = require('../../src/modules/flowengine/catalog');
const { testRule, testConditions, validateConditions } = require('../../src/modules/flowengine/conditions');

const catalog = catalogFor('SALES');
const check = (g) => validateGraph(g, { catalog, nodeType }).map((e) => e.message);
const when = (data = { event: 'STAGE_ENTERED' }) => ({ id: 'start', type: 'trigger', data });
const end = (id = 'end') => ({ id, type: 'end', data: {} });
const arrow = (source, target, sourceHandle) => ({ id: `${source}-${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) });
const flow = (nodes, edges) => ({ nodes, edges });

describe('flow engine: reading a canvas', () => {
  test('JSON text or an object; anything else is null', () => {
    assert.deepEqual(parseGraph('{"nodes":[],"edges":[]}'), { nodes: [], edges: [] });
    assert.ok(parseGraph({ nodes: [], edges: [] }));
    assert.equal(parseGraph('not json'), null);
    assert.equal(parseGraph({ nodes: [] }), null);
    assert.equal(parseGraph(null), null);
  });

  test('finds the start and follows arrows by their way out', () => {
    const g = flow([when(), end('a'), end('b')], [arrow('start', 'a'), arrow('start', 'b', 'other')]);
    assert.equal(triggerNode(g).id, 'start');
    assert.deepEqual(nextNodes(g, 'start', 'next').map((n) => n.id), ['a']);
    assert.deepEqual(nextNodes(g, 'start', 'other').map((n) => n.id), ['b']);
  });
});

describe('flow engine: what can be published', () => {
  test('a When block to an End is a valid flow', () => {
    assert.deepEqual(check(flow([when(), end()], [arrow('start', 'end')])), []);
  });

  test('empty, unreadable or without a start', () => {
    assert.deepEqual(check(null), ['The flow is empty or unreadable']);
    assert.deepEqual(check(flow([], [])), ['The flow has no blocks']);
    assert.ok(check(flow([end()], [])).includes('Add a “When” block to start the flow'));
  });

  test('exactly one When block', () => {
    const g = flow([when(), { ...when(), id: 'start2' }, end()], [arrow('start', 'end'), arrow('start2', 'end')]);
    assert.ok(check(g).includes('A flow has exactly one “When” block'));
  });

  test('the When block must name a known event; stages only narrow stage events', () => {
    assert.ok(check(flow([when({ event: 'NOPE' }), end()], [arrow('start', 'end')])).includes('choose what starts the flow'));
    assert.ok(check(flow([when({ event: 'ENQUIRY_WON', stages: ['REVIEW'] }), end()], [arrow('start', 'end')]))
      .includes('stages can only narrow a stage event'));
    assert.ok(check(flow([when({ event: 'STAGE_ENTERED', stages: ['ARCHIVED'] }), end()], [arrow('start', 'end')]))
      .includes('unknown stage: ARCHIVED'));
    assert.deepEqual(check(flow([when({ event: 'STAGE_ENTERED', stages: ['REVIEW', 'COSTING'] }), end()], [arrow('start', 'end')])), []);
  });

  test('unknown blocks, duplicate ids, broken or impossible arrows', () => {
    assert.ok(check(flow([when(), { id: 'x', type: 'teleport', data: {} }], [arrow('start', 'x')])).includes('Unknown block type "teleport"'));
    assert.ok(check(flow([when(), end('a'), end('a')], [arrow('start', 'a')])).includes('Two blocks share this id'));
    assert.ok(check(flow([when(), end()], [arrow('start', 'ghost')])).includes('An arrow connects a block that does not exist'));
    assert.ok(check(flow([when(), end()], [arrow('start', 'end', 'approved')])).includes('This block has no “approved” way out'));
    assert.ok(check(flow([when(), end()], [arrow('start', 'end'), arrow('end', 'start')])).some((m) => /no “next” way out|lead back/.test(m)));
  });

  test('every block must be reachable from the start', () => {
    assert.ok(check(flow([when(), end('a'), end('lonely')], [arrow('start', 'a')])).includes('Not connected to the “When” block'));
  });

  test('loops are refused', () => {
    // A stand-in pass-through block (the real ones arrive with part 2).
    const pass = { type: 'pass', label: 'Pass', handles: ['next', 'alt'], validate: () => [] };
    const withPass = (t) => (t === 'pass' ? pass : nodeType(t));
    const p = (id) => ({ id, type: 'pass', data: {} });
    const loopy = flow([when(), p('a'), p('b'), end()], [arrow('start', 'a'), arrow('a', 'b'), arrow('b', 'a', 'alt'), arrow('b', 'end')]);
    assert.ok(validateGraph(loopy, { catalog, nodeType: withPass }).some((e) => e.message === 'The arrows go round in a loop'));
    const straight = flow([when(), p('a'), p('b'), end()], [arrow('start', 'a'), arrow('a', 'b'), arrow('b', 'end')]);
    assert.deepEqual(validateGraph(straight, { catalog, nodeType: withPass }), []);
  });
});

describe('flow engine: does an event start the flow', () => {
  const t = nodeType('trigger');
  test('any stage when none are chosen', () => {
    assert.equal(t.matches({ event: 'STAGE_ENTERED' }, { type: 'STAGE_ENTERED', payload: { to: 'COSTING' } }), true);
  });
  test('only the chosen stages', () => {
    const data = { event: 'STAGE_ENTERED', stages: ['REVIEW'] };
    assert.equal(t.matches(data, { type: 'STAGE_ENTERED', payload: { to: 'REVIEW' } }), true);
    assert.equal(t.matches(data, { type: 'STAGE_ENTERED', payload: { to: 'COSTING' } }), false);
    assert.equal(t.matches({ event: 'STAGE_STALLED', stages: ['OFFER_RELEASED'] }, { type: 'STAGE_STALLED', payload: { stage: 'OFFER_RELEASED' } }), true);
  });
  test('events without stages always match', () => {
    assert.equal(t.matches({ event: 'ENQUIRY_WON' }, { type: 'ENQUIRY_WON', payload: {} }), true);
  });
});

// ── Part 2: the blocks ──────────────────────────────────────────────────────
const node = (id, type, data) => ({ id, type, data });

describe('flow engine: If conditions', () => {
  const facts = { value_inr: 7200000, is_refurbishment: false, enquiry_type: 'GENERATED', stage: 'OFFER_RELEASED', temperature: null, customer_id: 4 };
  const event = { type: 'ENQUIRY_LOST', payload: { from: 'COSTING_REVIEW', lost_reason: 'Price too high' } };
  test('numbers, yes/no, choices, stages, text', () => {
    assert.equal(testRule({ field: 'value_inr', op: 'gt', value: 5000000 }, facts, event), true);
    assert.equal(testRule({ field: 'value_inr', op: 'gt', value: '7200000' }, facts, event), false, 'a typed value is a number too');
    assert.equal(testRule({ field: 'value_inr', op: 'lte', value: 7200000 }, facts, event), true);
    assert.equal(testRule({ field: 'is_refurbishment', op: 'is_false' }, facts, event), true);
    assert.equal(testRule({ field: 'enquiry_type', op: 'eq', value: 'INCOMING' }, facts, event), false);
    assert.equal(testRule({ field: 'event.from', op: 'in', value: ['COSTING_REVIEW', 'OFFER_RELEASED'] }, facts, event), true);
    assert.equal(testRule({ field: 'event.lost_reason', op: 'contains', value: 'price' }, facts, event), true);
    assert.equal(testRule({ field: 'temperature', op: 'empty' }, facts, event), true);
    assert.equal(testRule({ field: 'customer_id', op: 'eq', value: '4' }, facts, event), true);
  });
  test('an empty value never passes a comparison', () => {
    assert.equal(testRule({ field: 'expected_value_inr', op: 'gt', value: 0 }, {}, event), false);
    assert.equal(testRule({ field: 'expected_value_inr', op: 'lt', value: 100 }, {}, event), false);
  });
  test('all vs any', () => {
    const rules = [{ field: 'value_inr', op: 'gt', value: 1 }, { field: 'is_refurbishment', op: 'is_true' }];
    assert.equal(testConditions({ match: 'all', rules }, facts, event), false);
    assert.equal(testConditions({ match: 'any', rules }, facts, event), true);
    assert.equal(testConditions({ rules }, facts, event), false, 'all by default');
  });
  test('checked against the catalog and the flow’s event', () => {
    const v = (rules, ev = 'ENQUIRY_LOST') => validateConditions({ rules }, catalog, ev);
    assert.deepEqual(v([]), ['add at least one rule']);
    assert.deepEqual(v([{ field: 'nope', op: 'eq', value: 1 }]), ['rule 1: choose a field']);
    assert.deepEqual(v([{ field: 'value_inr', op: 'contains', value: 1 }]), ['rule 1: “contains” does not apply to Value (₹) — PO once won, else the latest offer sent, else expected']);
    assert.deepEqual(v([{ field: 'value_inr', op: 'gt', value: 'lots' }]), ['rule 1: the value must be a number']);
    assert.deepEqual(v([{ field: 'stage', op: 'in', value: ['MOON'] }]), ['rule 1: unknown stage']);
    assert.deepEqual(v([{ field: 'event.offer_value_inr', op: 'gt', value: 1 }]), ['rule 1: “Offer value (₹)” is not part of this flow’s event']);
    assert.deepEqual(v([{ field: 'event.from', op: 'in', value: ['NEGOTIATION'] }, { field: 'is_refurbishment', op: 'is_true' }]), []);
  });
});

describe('flow engine: Which stage? / Assign / Notify settings', () => {
  test('Which stage? has a way out per group plus “other”; a stage sits in one group', () => {
    const sw = nodeType('stage_switch');
    assert.deepEqual(sw.handlesFor({ cases: [{ id: 'internal', stages: ['REVIEW'] }] }), ['internal', 'other']);
    assert.deepEqual(sw.validate({ cases: [{ id: 'a', stages: ['REVIEW'] }, { id: 'b', stages: ['REVIEW'] }] }, catalog), ['group 2: REVIEW is already in another group']);
    assert.deepEqual(sw.validate({ cases: [] }, catalog), ['add at least one stage group']);
  });

  test('Which stage? picks the stage just entered', async () => {
    const sw = nodeType('stage_switch');
    const data = { cases: [{ id: 'int', stages: ['REVIEW', 'COSTING'] }, { id: 'field', stages: ['FOLLOW_UP'] }] };
    assert.equal((await sw.run({ event: { type: 'STAGE_ENTERED', payload: { to: 'COSTING' } }, facts: { stage: 'CONCEPT' } }, { data })).handle, 'int');
    assert.equal((await sw.run({ event: { type: 'ENQUIRY_WON', payload: {} }, facts: { stage: 'FOLLOW_UP' } }, { data })).handle, 'field');
    assert.equal((await sw.run({ event: { type: 'STAGE_ENTERED', payload: { to: 'NEW' } }, facts: {} }, { data })).handle, 'other');
  });

  test('Assign needs its target, and only works in a stage flow', () => {
    const a = nodeType('assign');
    assert.deepEqual(a.validate({ to: 'PERSON' }, catalog), ['choose the person']);
    assert.deepEqual(a.validate({ to: 'DEPARTMENT', department_id: 3 }, catalog), ['choose who in the department gets it']);
    assert.deepEqual(a.validate({ to: 'DEPARTMENT', department_id: 3, pick: 'LEAST_BUSY' }, catalog), []);
    assert.deepEqual(a.validate({ to: 'SAME_AS_STAGE', stage: 'OFFER_RELEASED' }, catalog), []);
    assert.deepEqual(a.refs({ to: 'ROLE', role_id: '7', pick: 'TURN' }), [{ kind: 'role', id: 7 }]);
    const g = flow([when({ event: 'ENQUIRY_WON' }), node('as', 'assign', { to: 'OWNER' })], [arrow('start', 'as')]);
    assert.ok(check(g).includes('“Assign” works only in a flow started by “Enquiry enters a stage”'));
  });

  test('one Assign per path; branches each have their own', () => {
    const iff = node('if', 'if', { rules: [{ field: 'is_refurbishment', op: 'is_true' }] });
    const two = flow([when(), node('a1', 'assign', { to: 'OWNER' }), node('a2', 'assign', { to: 'CREATOR' })], [arrow('start', 'a1'), arrow('a1', 'a2')]);
    assert.ok(check(two).includes('Another Assign follows this one — one Assign per path'));
    const branches = flow([when(), iff, node('a1', 'assign', { to: 'OWNER' }), node('a2', 'assign', { to: 'CREATOR' })],
      [arrow('start', 'if'), arrow('if', 'a1', 'yes'), arrow('if', 'a2', 'no')]);
    assert.deepEqual(check(branches), []);
  });

  test('one arrow per way out', () => {
    const g = flow([when(), end('a'), end('b')], [arrow('start', 'a'), arrow('start', 'b')]);
    assert.ok(check(g).includes('Only one arrow can leave by “next”'));
  });

  test('Notify needs recipients and a title; only known {{words}}', () => {
    const n = nodeType('notify');
    assert.deepEqual(n.validate({ to: [], title: '' }, catalog), ['choose who to notify', 'write a title']);
    assert.deepEqual(n.validate({ to: [{ who: 'PERSON' }], title: 'x' }, catalog), ['recipient 1: choose from the list']);
    assert.deepEqual(n.validate({ to: [{ who: 'OWNER' }], title: '{{ref_no}} lost', message: 'Because {{price}}' }, catalog), ['unknown word: {{price}}']);
    assert.deepEqual(n.refs({ to: [{ who: 'DEPARTMENT_HEAD', id: 2 }, { who: 'OWNER' }] }), [{ kind: 'department', id: 2 }]);
  });

  test('messages fill in the record and the event; rupees grouped the Indian way', () => {
    const out = render('{{ref_no}} lost at {{event.from}} — {{value_inr}} ({{event.lost_to}})', { ref_no: 'ENQ-1', value_inr: 7200000 }, { payload: { from: 'COSTING_REVIEW' } });
    assert.equal(out, 'ENQ-1 lost at COSTING_REVIEW — ₹72,00,000 (—)');
  });
});
