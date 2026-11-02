'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BLOCK, OPERATORS, ASSIGN_TO, DEPARTMENT_PICK, ROLE_PICK, PEOPLE } from './flowMeta';

/**
 * The "i" help for a block: what it does, when to use it, and what each of its
 * dropdown terms means. The If block's field list is built from the same
 * catalog as its dropdown (and the chosen When), so the help shows exactly the
 * choices on screen — including the look-alike names, side by side.
 */

/** What each If field means. Keyed by catalog field key. */
const FIELD_HELP = {
  stage: 'The stage the enquiry is in. For “Enquiry enters a stage” and “Before moving to a stage” it is the stage it is moving into.',
  enquiry_type: 'Generated (we found the customer) or Incoming (the customer came to us).',
  is_refurbishment: 'Yes when the enquiry is marked as a refurbishment.',
  expected_value_inr: 'The expected value typed on the enquiry — the early estimate. It does not change when offers are sent.',
  final_cost_inr: 'The final costing value (entered at Costing, checked at Costing Review). Empty until it is entered.',
  offer_value_inr: 'The latest offer revision sent — picked on its own; drafts and deleted revisions never count. With an offer trigger it is the revision being sent right now (any round). Empty until an offer is sent.',
  negotiated_value_inr: 'The latest revision sent during Negotiation — picked on its own. With an offer trigger at Negotiation it is the revision being sent right now. Empty until one is sent.',
  order_value_inr: 'The PO value. With a won trigger (“Before marking won” too) it is the PO being entered; otherwise empty until won.',
  value_inr: 'The latest price: expected → offer → negotiated → PO, whichever is the latest. The same figure the pipeline, dashboards and the enquiry page show as Current value.',
  temperature: 'Hot, Warm or Cold, as set on the enquiry.',
  application_id: 'The application chosen on the enquiry.',
  customer_id: 'The customer of the enquiry.',
  owner_id: 'The salesperson who owns the enquiry.',
  currency_code: 'The enquiry’s currency as a 3-letter code: INR, EUR, USD…',
  'event.from': 'The stage it is leaving (where it was just before this action).',
  'event.to': 'The stage it is going into.',
  'event.margin_inr': 'Offer value − costing value, in ₹ — for the offer being sent.',
  'event.margin_pct': 'Margin as a % of the offer value. Offer ₹100, costing ₹80 → 20%.',
  'event.markup_pct': 'Margin as a % of the costing value. Offer ₹100, costing ₹80 → 25%.',
  'event.offer_value_inr': 'Older name for Offer value — same number. Choose “Offer value (₹)” instead.',
  'event.cost_value_inr': 'Older name for Costing value — same number. Choose “Costing value (₹)” instead.',
  'event.order_value_inr': 'Older name for PO value — same number. Choose “PO value (₹)” instead.',
  'event.lost_reason': 'The reason typed when marking it lost.',
  'event.kind': 'Which kind of document was uploaded (Offer, Costing, Concept…).',
  'event.type': 'Call, Meeting, Teams, Site visit or Email.',
  'event.is_review': 'Yes when the activity was logged as a review.',
  'event.days': 'How many days it has been sitting in the stage.',
};

const OPERATOR_HELP = {
  eq: 'exactly equal', ne: 'anything except', gt: 'bigger than (not equal)', gte: 'equal or bigger',
  lt: 'smaller than (not equal)', lte: 'equal or smaller', in: 'matches any one you tick', not_in: 'matches none you tick',
  contains: 'has this text anywhere in it', empty: 'nothing entered', not_empty: 'something entered',
  is_true: 'ticked / yes', is_false: 'not ticked / no',
};

const PEOPLE_HELP = {
  OWNER: 'The salesperson responsible for the enquiry (Owner on the enquiry). Stays the same as stages change.',
  HANDLER: 'Whoever the enquiry is with right now (the holder). Changes as it moves between people and stages.',
  CREATOR: 'The person who created the enquiry.',
  PERSON: 'One named person you pick.',
  ROLE: 'Every active user with the role you pick.',
  DEPARTMENT_HEAD: 'The head of the department you pick (set in Departments).',
  DEPARTMENT: 'Every active member of the department you pick.',
};

const ASSIGN_HELP = {
  PERSON: 'Always the person you pick.',
  DEPARTMENT: 'Someone in a department — then choose how they are picked (below).',
  ROLE: 'Someone with a role — then choose how they are picked (below).',
  OWNER: 'The salesperson who owns the enquiry.',
  CREATOR: 'The person who created the enquiry.',
  SAME_AS_STAGE: 'Whoever held it when it was last at the stage you pick — e.g. back to the same engineer who did Costing.',
  SETUP_HANDLER: 'The Internal Sales person chosen in Flow Builder → Sales → Setup.',
};

const PICK_HELP = {
  HEAD_PICKS: 'The head holds it and chooses someone from “Assign to my team”. Reminded after 4 hours.',
  HEAD: 'The department head takes it themselves.',
  LEAST_BUSY: 'Whoever has the fewest open enquiries right now.',
  TURN: 'Takes turns round the team, one after another.',
};

const EVENT_HELP = {
  ENQUIRY_CREATED: 'A new enquiry is saved.',
  STAGE_ENTERED: 'The enquiry has moved into a stage (by a person or on its own).',
  OFFER_SENT: 'An offer has been marked sent to the customer.',
  ENQUIRY_WON: 'It has been marked won (PO received).',
  ENQUIRY_LOST: 'It has been marked lost.',
  ENQUIRY_REOPENED: 'A won or lost enquiry has been reopened.',
  ENQUIRY_REASSIGNED: 'The owner or holder has been changed by hand.',
  ACTIVITY_LOGGED: 'A call, meeting, visit, email or review has been logged.',
  DOCUMENT_UPLOADED: 'A document has been uploaded.',
  STAGE_STALLED: 'It has sat in a stage longer than that stage’s time limit.',
  BEFORE_STAGE_MOVE: 'Someone clicks to move it to a stage — not done yet.',
  BEFORE_OFFER_SENT: 'Someone clicks “Mark offer sent” — not done yet.',
  BEFORE_WON: 'Someone clicks “Mark won” — not done yet.',
  BEFORE_LOST: 'Someone clicks “Mark lost” — not done yet.',
  BEFORE_REOPEN: 'Someone clicks “Reopen” — not done yet.',
};

const WORD_HELP = {
  ref_no: 'Enquiry number (ENQ-…)', title: 'Enquiry title', customer: 'Customer name', stage_label: 'Stage now',
  owner: 'Owner’s name', handler: 'Holder’s name', application: 'Application', value_inr: 'Current value in ₹',
  'event.from': 'Stage it left', 'event.to': 'Stage it went to', 'event.lost_reason': 'Lost reason', 'event.lost_to': 'Lost to (competitor)',
  'event.offer_value_inr': 'Offer value ₹ (the offer being sent)', 'event.order_value_inr': 'PO value ₹ (being entered)', 'event.days': 'Days in stage',
  'event.cost_value_inr': 'Costing value ₹', 'event.margin_inr': 'Margin ₹', 'event.margin_pct': 'Margin % of offer value', 'event.markup_pct': 'Markup % on costing value',
  'approval.decided_by': 'Who approved / rejected', 'approval.comment': 'Their comment', 'approval.status': 'Approved / Rejected / Withdrawn',
};

const H = ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mt-5 mb-2 first:mt-0">{children}</h3>;
const P = ({ children }) => <p className="text-sm text-gray-600 mb-2">{children}</p>;

/** A two-column list: the term as it appears in the dropdown, and what it means. */
function Terms({ rows }) {
  return (
    <dl className="divide-y divide-gray-100 border border-gray-200 rounded text-sm">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2">
          <dt className="font-medium text-gray-800">
            {r.term}
            {r.badge && <span className="ml-1.5 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{r.badge}</span>}
          </dt>
          <dd className="text-gray-600">{r.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function IfHelp({ catalog, event }) {
  const fields = catalog.fields.filter((f) => (!f.events || f.events.includes(event)) && !f.hidden);
  const enquiry = fields.filter((f) => !f.key.startsWith('event.'));
  const action = fields.filter((f) => f.key.startsWith('event.'));
  const row = (f) => ({ key: f.key, term: f.label.replace(/ —.*$/, ''), text: FIELD_HELP[f.key] || '' });
  const eventLabel = catalog.events.find((e) => e.key === event)?.label;
  return (
    <>
      <H>What it does</H>
      <P>Checks the enquiry and sends it down the <b>Yes</b> or the <b>No</b> way. Use it when only some enquiries should get an approval, an assignment or a message — e.g. “Margin % of offer value is less than 15 → Approval”.</P>
      <P><b>Yes when all</b> = every rule must be true. <b>Yes when any</b> = one true rule is enough.</P>

      <H>The money figures, in the order they happen</H>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs mb-2">
        {['Expected value', 'Costing value', 'Offer value', 'Negotiated value', 'PO value'].map((t, i) => (
          <li key={t} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-gray-400" aria-hidden>→</span>}
            <span className="px-2 py-1 rounded bg-[var(--ams-primary-mid)] text-[var(--ams-primary)] font-medium">{t}</span>
          </li>
        ))}
      </ol>
      <P>Each has one name, the same as on the enquiry page and the Enquiries list. <b>Current value</b> is not typed: it is the latest price — the expected value, then the latest offer, then the negotiated price, then the PO. <b>Margin</b> compares the offer value with the costing value.</P>

      <H>The enquiry</H>
      <P>Offered with every trigger. Offer revisions are picked on their own — you never choose one.</P>
      <Terms rows={enquiry.map(row)} />

      <H>This action {eventLabel && <span className="font-normal text-gray-500">(only with “{eventLabel}”)</span>}</H>
      {action.length ? (
        <>
          <P>Only what this action brings. They change with the When block’s choice.</P>
          <Terms rows={action.map(row)} />
        </>
      ) : <P>The chosen When brings nothing extra — only the enquiry’s fields are offered.</P>}

      <p className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
        <b>Example:</b> Rev 1 sent at ₹10 L, Rev 2 at ₹9.5 L → Offer value ₹9.5 L. Rev 3 sent in Negotiation at ₹9 L → Negotiated value ₹9 L, Current value ₹9 L. About to send Rev 4 at ₹8 L → a “Before marking an offer sent” flow sees ₹8 L and its margin.
      </p>

      <H>The tests</H>
      <Terms rows={Object.entries(OPERATORS).map(([k, v]) => ({ key: k, term: v, text: OPERATOR_HELP[k] }))} />

      <H>Good to know</H>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
        <li>An empty figure never matches “more than”, “less than” and the like. To catch it too, add “… is empty” and choose <b>any</b>.</li>
        <li>Amounts are in ₹ — enquiries in another currency are converted first.</li>
        <li>“More than 10,00,000” leaves out exactly ₹10,00,000; “at least” includes it.</li>
      </ul>
    </>
  );
}

function body(kind, catalog, event) {
  if (kind === 'if') return <IfHelp catalog={catalog} event={event} />;
  if (kind === 'trigger') {
    return (
      <>
        <H>What it does</H>
        <P>The start of every flow: what makes it run. A flow has one When.</P>
        <P><b>When something happens</b> runs after the action is done — it can assign and notify, but cannot stop it. <b>Before an action</b> runs the moment someone clicks — it can hold the action with an Approval.</P>
        <H>The choices</H>
        <Terms rows={catalog.events.map((e) => ({ key: e.key, term: e.label, text: EVENT_HELP[e.key] || '', badge: e.guard ? 'can hold' : null }))} />
        <H>Only for these stages</H>
        <P>For stage triggers: tick the stages the flow is for. None ticked = every stage.</P>
      </>
    );
  }
  if (kind === 'stage_switch') {
    return (
      <>
        <H>What it does</H>
        <P>Splits the flow by the stage the enquiry is in. Each group of stages gets its own way out; stages in no group go by <b>Other</b>.</P>
        <P>Use it with “Enquiry enters a stage” to give each stage its own Assign — e.g. Concept and Costing → Engineering, Offer → Internal Sales. A stage can be in one group only.</P>
      </>
    );
  }
  if (kind === 'assign') {
    return (
      <>
        <H>What it does</H>
        <P>Hands the enquiry to someone — they become the holder. Use it after “Enquiry enters a stage” (or a Which stage? group).</P>
        <H>Give it to</H>
        <Terms rows={ASSIGN_TO.map((a) => ({ key: a.key, term: a.label, text: ASSIGN_HELP[a.key] }))} />
        <H>Who in the department / with the role</H>
        <Terms rows={[...DEPARTMENT_PICK, ...ROLE_PICK.filter((r) => !DEPARTMENT_PICK.some((d) => d.key === r.key))].map((p) => ({ key: p.key, term: p.label, text: PICK_HELP[p.key] }))} />
        <P>If nobody active matches, the built-in rule decides — an enquiry is never left with nobody.</P>
      </>
    );
  }
  if (kind === 'approval') {
    return (
      <>
        <H>What it does</H>
        <P>Holds the action until it is approved. Works only after a <b>“Before …”</b> When (e.g. Before marking an offer sent). The approvers get a bell, push and email straight away; the person sees “Waiting for approval”.</P>
        <P>Ways out: <b>Approved</b> (the action goes through), <b>Rejected</b> (it does not), <b>Withdrawn</b> (the person took it back). Put a Notify on any of them.</P>
        <H>Approved by</H>
        <Terms rows={PEOPLE.map((p) => ({ key: p.key, term: p.label, text: PEOPLE_HELP[p.key] }))} />
        <H>The other settings</H>
        <Terms rows={[
          { key: 'any', term: 'Any one of them', text: 'The first approval decides.' },
          { key: 'all', term: 'All of them', text: 'Everyone listed must approve; one rejection rejects it. A Super Admin decides it outright.' },
          { key: 'remind', term: 'Remind after (hours)', text: 'The approvers are reminded if it is still waiting.' },
          { key: 'esc', term: 'Escalate after (hours)', text: 'Passed to the Super Admins if still waiting.' },
          { key: 'wd', term: 'Can be withdrawn', text: 'The person who asked can take it back (with a reason) while it waits.' },
        ]} />
      </>
    );
  }
  if (kind === 'notify') {
    return (
      <>
        <H>What it does</H>
        <P>Sends a bell notification, browser push and email. Never to the person whose action started it.</P>
        <H>Notify</H>
        <Terms rows={PEOPLE.map((p) => ({ key: p.key, term: p.label, text: PEOPLE_HELP[p.key] }))} />
        <H>Words you can use</H>
        <P>Click a word to add it to the message; it is replaced with the real value when sent.</P>
        <Terms rows={catalog.words.map((w) => ({ key: w, term: `{{${w}}}`, text: WORD_HELP[w] || '' }))} />
        <P>Words starting <code>event.</code> are filled only when the When brings them (e.g. margin with an offer); <code>approval.</code> only after an Approval.</P>
      </>
    );
  }
  return (
    <>
      <H>What it does</H>
      <P>Finishes the flow on this way. Use it to show clearly on the canvas that nothing more happens here — e.g. on an If’s No way.</P>
    </>
  );
}

export default function BlockHelp({ kind, catalog, event, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const meta = BLOCK[kind];

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="block-help-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center gap-2">
          <span className="w-7 h-7 rounded flex items-center justify-center text-white text-sm" style={{ backgroundColor: meta?.color }}>{meta?.icon}</span>
          <h2 id="block-help-title" className="text-lg font-bold text-gray-900">{meta?.label} block — help</h2>
        </div>
        <div className="overflow-y-auto px-6 py-4">{body(kind, catalog, event)}</div>
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary px-5 py-2" autoFocus>Got it</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
