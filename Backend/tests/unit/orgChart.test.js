/**
 * Organisation chart: each person's manager is who they report to, else the
 * head of their department; loops are refused when saving and broken when shown.
 *
 * Run:  node --test tests/unit/orgChart.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { managersOf, makesLoop, buildChart } = require('../../src/modules/users/orgChart');

// MD (Management) ← Sales head ← Regional manager ← Engineers; Internal sales → Sales head by department.
const MGMT = 1; const SALES = 2; const ENG = 3;
const departments = [
  { id: MGMT, head_user_id: 10 },
  { id: SALES, head_user_id: 20 },
  { id: ENG, head_user_id: null },
];
const people = [
  { id: 10, reports_to_id: null, department_id: MGMT }, // MD
  { id: 20, reports_to_id: 10, department_id: SALES }, // Sales head → MD
  { id: 21, reports_to_id: 20, department_id: SALES }, // Regional manager → Sales head
  { id: 22, reports_to_id: 21, department_id: SALES }, // Engineer → Regional manager
  { id: 23, reports_to_id: null, department_id: SALES }, // Internal sales → (department head) Sales head
  { id: 30, reports_to_id: null, department_id: ENG }, // Engineering, no head yet → not placed
  { id: 40, reports_to_id: null, department_id: null }, // no department → not placed
];
const linkOf = (id, list = people) => managersOf(list, departments).get(id);

describe('organisation chart: who is whose manager', () => {
  test('reports to, when set', () => {
    assert.deepEqual(linkOf(22), { manager_id: 21, basis: 'REPORTS_TO' });
  });

  test('otherwise the head of their department', () => {
    assert.deepEqual(linkOf(23), { manager_id: 20, basis: 'DEPARTMENT_HEAD' });
  });

  test('a department head is not their own manager; they follow their reports to', () => {
    assert.deepEqual(linkOf(20), { manager_id: 10, basis: 'REPORTS_TO' });
    assert.deepEqual(linkOf(10), { manager_id: null, basis: null }, 'the MD reports to nobody');
  });

  test('a manager who has left (not in the active list) is skipped: the department head stands in', () => {
    const without21 = people.filter((p) => p.id !== 21);
    assert.deepEqual(linkOf(22, without21), { manager_id: 20, basis: 'DEPARTMENT_HEAD' });
  });

  test('no reports to and no department head: nobody', () => {
    assert.deepEqual(linkOf(30), { manager_id: null, basis: null });
    assert.deepEqual(linkOf(40), { manager_id: null, basis: null });
  });
});

describe('organisation chart: loops', () => {
  test('refused when saving: oneself, someone below, or further below', () => {
    assert.equal(makesLoop(21, 21, people, departments), true, 'oneself');
    assert.equal(makesLoop(21, 22, people, departments), true, 'their own report');
    assert.equal(makesLoop(10, 22, people, departments), true, 'the MD under an engineer far below');
    assert.equal(makesLoop(20, 23, people, departments), true, 'below them through the department head');
    assert.equal(makesLoop(22, 23, people, departments), false, 'a sideways move is fine');
    assert.equal(makesLoop(23, null, people, departments), false, 'clearing is fine');
  });

  test('broken when shown (e.g. a department head set later closes one): the department-head link is cut first', () => {
    // 50 reports to 51; 51 is in a department whose head is 50 → 50 → 51 → 50.
    const d = [{ id: 9, head_user_id: 50 }];
    const p = [{ id: 50, reports_to_id: 51, department_id: 9 }, { id: 51, reports_to_id: null, department_id: 9 }];
    const chart = buildChart(p, d);
    assert.deepEqual(chart.loops.map((l) => [...l].sort()), [[50, 51]]);
    const byId = Object.fromEntries(chart.people.map((x) => [x.id, x]));
    assert.equal(byId[50].manager_id, 51, 'the chosen reports to stays');
    assert.equal(byId[51].manager_id, null, 'the department-head link is cut');
    assert.deepEqual(chart.roots, [51]);
  });
});

describe('organisation chart: the tree', () => {
  test('the top, the not placed, and how many report to each', () => {
    const chart = buildChart(people, departments);
    const byId = Object.fromEntries(chart.people.map((x) => [x.id, x]));
    assert.deepEqual(chart.roots, [10], 'the MD is at the top');
    assert.deepEqual(chart.not_placed.sort(), [30, 40]);
    assert.deepEqual([byId[10].reports_count, byId[20].reports_count, byId[21].reports_count], [1, 2, 1]);
    assert.equal(byId[23].manager_basis, 'DEPARTMENT_HEAD');
    assert.deepEqual(chart.loops, []);
  });
});
