/**
 * The Sales flows the portal starts with — added as drafts (never live on
 * their own) by the migration 20261029150000_sales_starter_flows, which was
 * generated from this file. Publish one to switch it on.
 *
 *   - Sales hand-offs (today's rules): exactly the built-in rule, drawn — the
 *     place to change who gets each stage.
 *   - Big offers need approval / Late-stage loss alert / Big order won: the
 *     agreed first flows. Their people are left to choose (Check says so);
 *     the amounts are a starting point.
 */

const INTERNAL_STAGES = ['REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW', 'OFFER_RELEASED', 'NEGOTIATION'];
const FIELD_STAGES = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'NEGOTIATION_FOLLOW_UP', 'WON', 'LOST'];
const LATE_STAGES = ['COSTING_REVIEW', 'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP'];

const node = (id, type, data, x, y) => ({ id, type, data, position: { x, y } });
const edge = (source, target, sourceHandle) => ({ id: `e-${source}-${sourceHandle || 'next'}-${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) });

const STARTER_FLOWS = Object.freeze([
  {
    name: 'Sales hand-offs (today’s rules)',
    description: 'Who holds an enquiry at each stage — the built-in rule, drawn: Internal Sales (the person set in Setup) prepares and negotiates; the field owner does the rest. Change a group or add stages to send them elsewhere.',
    graph: {
      nodes: [
        node('start', 'trigger', { event: 'STAGE_ENTERED' }, 300, 0),
        node('which', 'stage_switch', { cases: [
          { id: 'internal', label: 'Internal Sales', stages: INTERNAL_STAGES },
          { id: 'field', label: 'Field sales', stages: FIELD_STAGES },
        ] }, 300, 170),
        node('toInternal', 'assign', { to: 'SETUP_HANDLER' }, 60, 380),
        node('toOwner', 'assign', { to: 'OWNER' }, 380, 380),
        node('end', 'end', {}, 680, 380),
      ],
      edges: [edge('start', 'which'), edge('which', 'toInternal', 'internal'), edge('which', 'toOwner', 'field'), edge('which', 'end', 'other')],
    },
  },
  {
    name: 'Big offers need approval',
    description: 'An offer above ₹50 Lakh is held until approved; if rejected, whoever holds the enquiry is told why. Choose the approver, then publish.',
    graph: {
      nodes: [
        node('start', 'trigger', { event: 'BEFORE_OFFER_SENT' }, 300, 0),
        node('big', 'if', { match: 'all', rules: [{ field: 'event.offer_value_inr', op: 'gt', value: 5000000 }] }, 300, 160),
        node('approve', 'approval', { to: [{ who: 'PERSON' }], mode: 'ANY', remind_hours: 4, escalate_hours: 24 }, 120, 340),
        node('tell', 'notify', { to: [{ who: 'HANDLER' }], title: 'Offer for {{ref_no}} not approved', message: '{{approval.decided_by}}: {{approval.comment}}' }, 300, 540),
        node('end', 'end', {}, 560, 540),
      ],
      edges: [edge('start', 'big'), edge('big', 'approve', 'yes'), edge('big', 'end', 'no'), edge('approve', 'end', 'approved'), edge('approve', 'tell', 'rejected'), edge('tell', 'end')],
    },
  },
  {
    name: 'Late-stage loss alert',
    description: 'An enquiry lost at Costing Review or later tells the people you choose, with the reason and who it went to.',
    graph: {
      nodes: [
        node('start', 'trigger', { event: 'ENQUIRY_LOST' }, 300, 0),
        node('late', 'if', { match: 'all', rules: [{ field: 'event.from', op: 'in', value: LATE_STAGES }] }, 300, 160),
        node('tell', 'notify', { to: [{ who: 'PERSON' }], title: '{{ref_no}} lost at {{event.from}}', message: '{{customer}} — {{event.lost_reason}} (went to {{event.lost_to}}). Value {{value_inr}}.' }, 120, 340),
        node('end', 'end', {}, 420, 520),
      ],
      edges: [edge('start', 'late'), edge('late', 'tell', 'yes'), edge('late', 'end', 'no'), edge('tell', 'end')],
    },
  },
  {
    name: 'Big order won',
    description: 'An order above ₹1 Crore tells the people you choose (e.g. the MD and the Projects lead) so planning can start.',
    graph: {
      nodes: [
        node('start', 'trigger', { event: 'ENQUIRY_WON' }, 300, 0),
        node('big', 'if', { match: 'all', rules: [{ field: 'event.order_value_inr', op: 'gt', value: 10000000 }] }, 300, 160),
        node('tell', 'notify', { to: [{ who: 'PERSON' }, { who: 'PERSON' }], title: 'Order won: {{ref_no}} — {{event.order_value_inr}}', message: '{{customer}} · {{title}}. Owner {{owner}}.' }, 120, 340),
        node('end', 'end', {}, 420, 520),
      ],
      edges: [edge('start', 'big'), edge('big', 'tell', 'yes'), edge('big', 'end', 'no'), edge('tell', 'end')],
    },
  },
]);

module.exports = { STARTER_FLOWS, INTERNAL_STAGES, FIELD_STAGES };
