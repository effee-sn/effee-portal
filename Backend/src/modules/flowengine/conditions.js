/**
 * Conditions for the If block: a rule is { field, op, value } tested against
 * the record's facts and the event. Pure functions, shared by the publish
 * check and the runner.
 */

/** Operators each field type allows, with what the value must be. */
const OPS = Object.freeze({
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'],
  boolean: ['is_true', 'is_false'],
  text: ['eq', 'ne', 'contains', 'empty', 'not_empty'],
  enum: ['eq', 'ne', 'in', 'not_in', 'empty', 'not_empty'],
  stage: ['eq', 'ne', 'in', 'not_in'],
  ref: ['eq', 'ne', 'in', 'not_in', 'empty', 'not_empty'],
});

const NO_VALUE = new Set(['is_true', 'is_false', 'empty', 'not_empty']);
const LIST_VALUE = new Set(['in', 'not_in']);

/** A fact by key: "value_inr" from the record, "event.from" from the event's payload. */
function factOf(key, facts, event) {
  if (key.startsWith('event.')) return event?.payload?.[key.slice(6)];
  return facts?.[key];
}

const isEmpty = (v) => v === null || v === undefined || v === '';

/**
 * @param {{ field: string, op: string, value?: unknown }} rule
 * @param {object} facts  the record (see the module's loadEntity)
 * @param {object} event  { type, payload }
 * @returns {boolean}
 */
function testRule(rule, facts, event) {
  const v = factOf(rule.field, facts, event);
  const want = rule.value;
  switch (rule.op) {
    case 'is_true': return v === true;
    case 'is_false': return v === false || isEmpty(v);
    case 'empty': return isEmpty(v);
    case 'not_empty': return !isEmpty(v);
    case 'in': return Array.isArray(want) && want.map(String).includes(String(v));
    case 'not_in': return Array.isArray(want) && !want.map(String).includes(String(v));
    case 'contains': return !isEmpty(v) && String(v).toLowerCase().includes(String(want ?? '').toLowerCase());
    default: break;
  }
  if (typeof want === 'number' || (rule.op !== 'eq' && rule.op !== 'ne')) {
    // Numbers: an empty value never passes a comparison.
    if (isEmpty(v)) return rule.op === 'ne';
    const a = Number(v); const b = Number(want);
    switch (rule.op) {
      case 'eq': return a === b;
      case 'ne': return a !== b;
      case 'gt': return a > b;
      case 'gte': return a >= b;
      case 'lt': return a < b;
      case 'lte': return a <= b;
      default: return false;
    }
  }
  return rule.op === 'eq' ? String(v) === String(want) : String(v) !== String(want);
}

/**
 * The If block's settings: all (AND) or any (OR) of its rules.
 * @param {{ match?: 'all'|'any', rules: object[] }} data
 */
function testConditions(data, facts, event) {
  const rules = data?.rules || [];
  return data?.match === 'any' ? rules.some((r) => testRule(r, facts, event)) : rules.every((r) => testRule(r, facts, event));
}

/**
 * What is wrong with an If block's rules, against the catalog.
 * @returns {string[]}
 */
function validateConditions(data, catalog, triggerEvent) {
  const errors = [];
  if (data?.match !== undefined && !['all', 'any'].includes(data.match)) errors.push('choose “all” or “any” of the rules');
  const rules = data?.rules;
  if (!Array.isArray(rules) || !rules.length) return [...errors, 'add at least one rule'];
  const stages = new Set(catalog.stages.map((s) => s.key));
  rules.forEach((r, i) => {
    const n = `rule ${i + 1}`;
    const field = catalog.fields.find((f) => f.key === r?.field);
    if (!field) { errors.push(`${n}: choose a field`); return; }
    if (field.events && triggerEvent && !field.events.includes(triggerEvent)) {
      errors.push(`${n}: “${field.label}” is not part of this flow’s event`);
    }
    if (!OPS[field.type].includes(r.op)) { errors.push(`${n}: “${r.op}” does not apply to ${field.label}`); return; }
    if (NO_VALUE.has(r.op)) return;
    const vals = LIST_VALUE.has(r.op) ? r.value : [r.value];
    if (!Array.isArray(vals) || !vals.length || vals.some(isEmpty)) { errors.push(`${n}: enter a value`); return; }
    if (field.type === 'number' && vals.some((x) => !Number.isFinite(Number(x)))) errors.push(`${n}: the value must be a number`);
    if (field.type === 'stage' && vals.some((x) => !stages.has(x))) errors.push(`${n}: unknown stage`);
    if (field.type === 'enum' && vals.some((x) => !field.options.some((o) => o.key === x))) errors.push(`${n}: not one of the choices`);
    if (field.type === 'ref' && vals.some((x) => !Number.isInteger(Number(x)) || Number(x) <= 0)) errors.push(`${n}: pick from the list`);
  });
  return errors;
}

module.exports = { OPS, testRule, testConditions, validateConditions, factOf };
