'use client';

import {
  BLOCK, STAGE_EVENTS, OPERATORS, OPS_FOR, NO_VALUE, LIST_VALUE, ASSIGN_TO, DEPARTMENT_PICK, ROLE_PICK, PEOPLE,
} from './flowMeta';

/**
 * The settings of the selected block — dropdowns from the catalog and the
 * portal's own lists, so nobody types a code. Every change goes straight back
 * to the canvas (`onChange(newSettings)`).
 */

const label = 'block text-xs font-medium text-gray-600 mb-1';
const input = 'ams-input w-full text-sm';
const small = 'text-[11px] text-gray-500';

function Select({ value, onChange, options, placeholder = 'Choose…', ariaLabel }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={input} aria-label={ariaLabel}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}

/** Tick boxes for several choices (stages, options). */
function Checks({ value = [], onChange, options }) {
  const set = new Set(value);
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
      {options.map((o) => (
        <label key={o.key} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
          <input type="checkbox" checked={set.has(o.key)} className="cursor-pointer"
            onChange={(e) => onChange(e.target.checked ? [...value, o.key] : value.filter((x) => x !== o.key))} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

const asOptions = (rows) => rows.map((r) => ({ key: String(r.id), label: r.name }));

/** A list of people — Notify recipients, Approval approvers. */
function PeopleList({ value = [], onChange, lookups, noun }) {
  const set = (i, patch) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {value.map((r, i) => {
        const kind = PEOPLE.find((p) => p.key === r.who)?.needs;
        const list = kind === 'user' ? lookups.users : kind === 'role' ? lookups.roles : kind === 'department' ? lookups.departments : null;
        return (
          <div key={i} className="flex gap-1.5 items-start">
            <div className="flex-1 space-y-1">
              <Select value={r.who} onChange={(who) => set(i, { who, id: undefined })} options={PEOPLE} ariaLabel={`${noun} ${i + 1}`} />
              {list && <Select value={r.id ? String(r.id) : ''} onChange={(id) => set(i, { id: id ? Number(id) : undefined })} options={asOptions(list)} ariaLabel={`${noun} ${i + 1} — which`} />}
            </div>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} disabled={value.length === 1}
              className="px-2 py-1 text-gray-400 hover:text-red-600 disabled:opacity-30 cursor-pointer" aria-label={`Remove ${noun} ${i + 1}`}>×</button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...value, { who: 'PERSON' }])} className="text-xs text-[var(--ams-primary)] hover:underline cursor-pointer">+ Add {noun}</button>
    </div>
  );
}

/** One rule's value, shaped by its field's type. */
function RuleValue({ field, op, value, onChange, lookups }) {
  if (!field || NO_VALUE.includes(op)) return null;
  const many = LIST_VALUE.includes(op);
  let options = null;
  if (field.type === 'stage') options = lookups.catalog.stages;
  else if (field.type === 'enum') options = field.options;
  else if (field.type === 'ref') {
    options = asOptions(field.ref === 'user' ? lookups.users : field.ref === 'application' ? lookups.applications : lookups.customers);
  }
  if (options) {
    return many
      ? <Checks value={[].concat(value || []).map(String)} onChange={onChange} options={options} />
      : <Select value={value ?? ''} onChange={onChange} options={options} />;
  }
  if (field.type === 'number') {
    return (
      <div>
        <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={input} placeholder="Amount in ₹" aria-label="Value" />
        {Number(value) > 0 && <p className={small}>₹{Number(value).toLocaleString('en-IN')}</p>}
      </div>
    );
  }
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={input} aria-label="Value" />;
}

export default function Inspector({ node, event, lookups, errors, onChange, onDelete }) {
  if (!node) {
    return (
      <div className="p-4 text-sm text-gray-500 space-y-2">
        <p className="font-medium text-gray-700">Nothing selected</p>
        <p>Click a block to set it up. Drag blocks in from the left, and join them by dragging from a dot at the bottom of one block to the top of another.</p>
        <p>Select a block or an arrow and press Delete to remove it.</p>
      </div>
    );
  }
  const kind = node.data.kind;
  const d = node.data.settings;
  const set = (patch) => onChange({ ...d, ...patch });
  const { catalog } = lookups;
  const meta = BLOCK[kind];

  let body = null;
  if (kind === 'trigger') {
    const happen = catalog.events.filter((e) => !e.guard);
    const before = catalog.events.filter((e) => e.guard);
    body = (
      <>
        <div>
          <label className={label} htmlFor="ev">Starts</label>
          <select id="ev" value={d.event || ''} onChange={(e) => set({ event: e.target.value, stages: undefined })} className={input}>
            <option value="">Choose…</option>
            <optgroup label="When something happens">{happen.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</optgroup>
            <optgroup label="Before an action (can hold it for approval)">{before.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</optgroup>
          </select>
        </div>
        {STAGE_EVENTS.includes(d.event) && (
          <div>
            <p className={label}>Only for these stages <span className="font-normal text-gray-400">(none ticked = any)</span></p>
            <Checks value={d.stages || []} onChange={(stages) => set({ stages: stages.length ? stages : undefined })} options={catalog.stages} />
          </div>
        )}
        {catalog.events.find((e) => e.key === d.event)?.guard && (
          <p className={small}>Runs the moment someone tries it. Add an Approval to hold it; anything sent goes after the Approval.</p>
        )}
      </>
    );
  } else if (kind === 'if') {
    const fields = catalog.fields.filter((f) => !f.events || f.events.includes(event));
    const rules = d.rules || [];
    const setRule = (i, patch) => set({ rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
    body = (
      <>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Yes when</span>
          <select value={d.match || 'all'} onChange={(e) => set({ match: e.target.value })} className="ams-input text-sm py-1" aria-label="All or any">
            <option value="all">all</option>
            <option value="any">any</option>
          </select>
          <span className="text-gray-600">of these are true:</span>
        </div>
        {rules.map((r, i) => {
          const f = catalog.fields.find((x) => x.key === r.field);
          return (
            <div key={i} className="rounded border border-gray-200 p-2 space-y-1.5 bg-gray-50/60">
              <div className="flex gap-1.5">
                <Select value={r.field} onChange={(field) => setRule(i, { field, op: OPS_FOR[catalog.fields.find((x) => x.key === field)?.type]?.[0], value: '' })}
                  options={fields.map((x) => ({ key: x.key, label: x.label }))} ariaLabel={`Rule ${i + 1} field`} />
                <button type="button" onClick={() => set({ rules: rules.filter((_, j) => j !== i) })} disabled={rules.length === 1}
                  className="px-2 text-gray-400 hover:text-red-600 disabled:opacity-30 cursor-pointer" aria-label={`Remove rule ${i + 1}`}>×</button>
              </div>
              {f && <Select value={r.op} onChange={(op) => setRule(i, { op, value: LIST_VALUE.includes(op) ? [] : '' })} options={OPS_FOR[f.type].map((k) => ({ key: k, label: OPERATORS[k] }))} ariaLabel={`Rule ${i + 1} test`} />}
              <RuleValue field={f} op={r.op} value={r.value} onChange={(value) => setRule(i, { value })} lookups={lookups} />
            </div>
          );
        })}
        <button type="button" onClick={() => set({ rules: [...rules, { field: '', op: '', value: '' }] })} className="text-xs text-[var(--ams-primary)] hover:underline cursor-pointer">+ Add a rule</button>
      </>
    );
  } else if (kind === 'stage_switch') {
    const cases = d.cases || [];
    const setCase = (i, patch) => set({ cases: cases.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
    const taken = (i) => new Set(cases.flatMap((c, j) => (j === i ? [] : c.stages || [])));
    body = (
      <>
        <p className={small}>Each group gets its own way out; stages in no group go by “Other”.</p>
        {cases.map((c, i) => (
          <div key={c.id} className="rounded border border-gray-200 p-2 space-y-1.5 bg-gray-50/60">
            <div className="flex gap-1.5">
              <input value={c.label || ''} onChange={(e) => setCase(i, { label: e.target.value })} className={input} aria-label={`Group ${i + 1} name`} placeholder="Group name" />
              <button type="button" onClick={() => set({ cases: cases.filter((_, j) => j !== i) })} disabled={cases.length === 1}
                className="px-2 text-gray-400 hover:text-red-600 disabled:opacity-30 cursor-pointer" aria-label={`Remove group ${i + 1}`}>×</button>
            </div>
            <Checks value={c.stages || []} onChange={(stages) => setCase(i, { stages })} options={catalog.stages.filter((s) => !taken(i).has(s.key))} />
          </div>
        ))}
        <button type="button" onClick={() => set({ cases: [...cases, { id: `g${Math.random().toString(36).slice(2, 8)}`, label: `Group ${cases.length + 1}`, stages: [] }] })}
          className="text-xs text-[var(--ams-primary)] hover:underline cursor-pointer">+ Add a group</button>
      </>
    );
  } else if (kind === 'assign') {
    body = (
      <>
        <div>
          <label className={label} htmlFor="to">Give it to</label>
          <Select value={d.to} onChange={(to) => onChange({ to })} options={ASSIGN_TO} ariaLabel="Give it to" />
        </div>
        {d.to === 'PERSON' && <Select value={d.user_id ? String(d.user_id) : ''} onChange={(v) => set({ user_id: Number(v) || undefined })} options={asOptions(lookups.users)} ariaLabel="Person" />}
        {d.to === 'DEPARTMENT' && (
          <>
            <Select value={d.department_id ? String(d.department_id) : ''} onChange={(v) => set({ department_id: Number(v) || undefined })} options={asOptions(lookups.departments)} ariaLabel="Department" />
            <Select value={d.pick} onChange={(pick) => set({ pick })} options={DEPARTMENT_PICK} placeholder="Who in it…" ariaLabel="Who in the department" />
            {d.pick === 'HEAD_PICKS' && <p className={small}>The head holds it and gets it in “Assign to my team”; reminded after 4 hours.</p>}
          </>
        )}
        {d.to === 'ROLE' && (
          <>
            <Select value={d.role_id ? String(d.role_id) : ''} onChange={(v) => set({ role_id: Number(v) || undefined })} options={asOptions(lookups.roles)} ariaLabel="Role" />
            <Select value={d.pick} onChange={(pick) => set({ pick })} options={ROLE_PICK} placeholder="Who with it…" ariaLabel="Who with the role" />
          </>
        )}
        {d.to === 'SAME_AS_STAGE' && <Select value={d.stage} onChange={(stage) => set({ stage })} options={catalog.stages} ariaLabel="Earlier stage" />}
        <p className={small}>If nobody active matches, the built-in rule decides — an enquiry is never left with nobody.</p>
      </>
    );
  } else if (kind === 'approval') {
    body = (
      <>
        <div><p className={label}>Approved by</p><PeopleList value={d.to} onChange={(to) => set({ to })} lookups={lookups} noun="approver" /></div>
        <div>
          <label className={label} htmlFor="mode">How many</label>
          <select id="mode" value={d.mode || 'ANY'} onChange={(e) => set({ mode: e.target.value })} className={input}>
            <option value="ANY">Any one of them</option>
            <option value="ALL">All of them</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label} htmlFor="rh">Remind after (hours)</label><input id="rh" type="number" min={1} max={168} value={d.remind_hours ?? 4} onChange={(e) => set({ remind_hours: Number(e.target.value) })} className={input} /></div>
          <div><label className={label} htmlFor="eh">Escalate after (hours)</label><input id="eh" type="number" min={1} max={720} value={d.escalate_hours ?? 24} onChange={(e) => set({ escalate_hours: Number(e.target.value) })} className={input} /></div>
        </div>
        <p className={small}>Escalation passes it to the Super Admins. If the person acting is an approver, it is approved there and then.</p>
        <p className={small}>Withdrawn: the person who asked took it back (with a reason). With nothing on that way, the approvers are told “no action needed”.</p>
      </>
    );
  } else if (kind === 'notify') {
    body = (
      <>
        <div><p className={label}>Notify</p><PeopleList value={d.to} onChange={(to) => set({ to })} lookups={lookups} noun="recipient" /></div>
        <div><label className={label} htmlFor="nt">Title</label><input id="nt" value={d.title || ''} onChange={(e) => set({ title: e.target.value })} maxLength={150} className={input} placeholder="e.g. {{ref_no}} lost at {{event.from}}" /></div>
        <div><label className={label} htmlFor="nm">Message</label><textarea id="nm" value={d.message || ''} onChange={(e) => set({ message: e.target.value })} maxLength={1000} rows={3} className={input} /></div>
        <div>
          <p className={small}>Words you can use:</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {catalog.words.map((w) => (
              <button key={w} type="button" onClick={() => set({ message: `${d.message || ''}{{${w}}}` })}
                className="px-1.5 py-0.5 rounded bg-gray-100 text-[11px] font-mono text-gray-700 hover:bg-gray-200 cursor-pointer">{`{{${w}}}`}</button>
            ))}
          </div>
        </div>
        <p className={small}>Sent as a bell notification, browser push and email — not to the person whose action started it.</p>
      </>
    );
  } else {
    body = <p className="text-sm text-gray-500">The flow ends here.</p>;
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded flex items-center justify-center text-white text-xs" style={{ backgroundColor: meta?.color }}>{meta?.icon}</span>
        <p className="font-semibold text-gray-800">{meta?.label}</p>
        {kind !== 'trigger' && <button type="button" onClick={onDelete} className="ml-auto text-xs text-red-600 hover:underline cursor-pointer">Remove block</button>}
      </div>
      {errors?.length > 0 && (
        <ul className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 list-disc pl-5">
          {errors.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}
      {body}
    </div>
  );
}
