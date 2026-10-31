/**
 * The organisation chart — who reports to whom — from two things people set:
 *
 *   - a user's **Reports to** (their reporting manager), when set;
 *   - otherwise the **head of their department**.
 *
 * Department heads report to whoever they are set to report to (e.g. the
 * Managing Director in Management); the person at the top reports to nobody.
 * Only active people take part: a manager who has left is skipped and the
 * department head stands in.
 *
 * Pure functions over plain rows, so the chart, the save-time check and later
 * users of "the manager of …" all follow the same rule.
 */

/**
 * @typedef {{ id: number, reports_to_id: number|null, department_id: number|null }} Person
 * @typedef {{ id: number, head_user_id: number|null }} Dept
 * @typedef {{ manager_id: number|null, basis: 'REPORTS_TO'|'DEPARTMENT_HEAD'|null }} Link
 */

/**
 * Each person's manager, before loops are checked.
 * @param {Person[]} people   active people only
 * @param {Dept[]} departments
 * @returns {Map<number, Link>}
 */
function managersOf(people, departments) {
  const present = new Set(people.map((p) => p.id));
  const headOf = new Map(departments.map((d) => [d.id, d.head_user_id]));
  const out = new Map();
  for (const p of people) {
    if (p.reports_to_id && p.reports_to_id !== p.id && present.has(p.reports_to_id)) {
      out.set(p.id, { manager_id: p.reports_to_id, basis: 'REPORTS_TO' });
      continue;
    }
    const head = p.department_id ? headOf.get(p.department_id) : null;
    if (head && head !== p.id && present.has(head)) out.set(p.id, { manager_id: head, basis: 'DEPARTMENT_HEAD' });
    else out.set(p.id, { manager_id: null, basis: null });
  }
  return out;
}

/**
 * Finds loops (A → B → A) and breaks each one so the chart is a tree: a link
 * that comes from a department head is cut before a Reports to someone chose.
 * @param {Map<number, Link>} links  changed in place
 * @returns {number[][]} the loops found (each as the people in it)
 */
function breakLoops(links) {
  const loops = [];
  const done = new Set();
  for (const start of links.keys()) {
    if (done.has(start)) continue;
    const path = []; const onPath = new Map();
    let at = start;
    while (at !== null && !done.has(at) && !onPath.has(at)) {
      onPath.set(at, path.length); path.push(at);
      at = links.get(at)?.manager_id ?? null;
    }
    if (at !== null && onPath.has(at)) {
      const loop = path.slice(onPath.get(at));
      loops.push(loop);
      const cut = loop.find((id) => links.get(id).basis === 'DEPARTMENT_HEAD') ?? Math.min(...loop);
      links.set(cut, { manager_id: null, basis: null });
    }
    for (const id of path) done.add(id);
  }
  return loops;
}

/**
 * Would setting `personId` to report to `managerId` make a loop? True when the
 * new manager is the person, or reports — directly or up the chain — to them.
 * @param {Person[]} people @param {Dept[]} departments
 */
function makesLoop(personId, managerId, people, departments) {
  if (managerId === null || managerId === undefined) return false;
  if (managerId === personId) return true;
  const changed = people.map((p) => (p.id === personId ? { ...p, reports_to_id: managerId } : p));
  const links = managersOf(changed, departments);
  const seen = new Set();
  let at = managerId;
  while (at !== null && !seen.has(at)) {
    if (at === personId) return true;
    seen.add(at);
    at = links.get(at)?.manager_id ?? null;
  }
  return false;
}

/**
 * The chart: each person with their manager, how many report to them, and the
 * loops that had to be broken. People with no manager and nobody under them
 * are "not placed".
 * @param {(Person & object)[]} people @param {Dept[]} departments
 */
function buildChart(people, departments) {
  const links = managersOf(people, departments);
  const loops = breakLoops(links);
  const reports = new Map();
  for (const [id, l] of links) if (l.manager_id !== null) reports.set(l.manager_id, (reports.get(l.manager_id) || 0) + 1);
  const rows = people.map((p) => ({
    ...p,
    manager_id: links.get(p.id).manager_id,
    manager_basis: links.get(p.id).basis,
    reports_count: reports.get(p.id) || 0,
  }));
  return {
    people: rows,
    roots: rows.filter((r) => r.manager_id === null && r.reports_count > 0).map((r) => r.id),
    not_placed: rows.filter((r) => r.manager_id === null && r.reports_count === 0).map((r) => r.id),
    loops,
  };
}

module.exports = { managersOf, breakLoops, makesLoop, buildChart };
