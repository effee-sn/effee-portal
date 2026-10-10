const { salesReportsRepository } = require('./sales.reports.repository');
const { salesConfigService } = require('../sales/config.service');
const { loadRates, toInr, paise } = require('../master/fx');
const { STAGE_AGING_DAYS } = require('../sales/followup.service');

/**
 * Sales MIS report definitions.
 *
 * Each report declares its columns (with a type the viewer and the Excel
 * export both understand), which filters apply, and a `build(filter)` that
 * returns `{ rows, totals }`. Money columns of type `inr` are rupees: open
 * amounts at the current rate, won orders and sent offers at their locked
 * rate. `amount` columns are in the row's own currency (see its `currency`).
 *
 * Column types: text · date · int · inr · amount · pct · rate
 *
 * @param {ReturnType<typeof import('./sales.reports.repository').createSalesReportsRepository>} repository
 */
function createSalesReports(repository, config = salesConfigService) {
  const DAY_MS = 24 * 60 * 60 * 1000;

  const STAGE = {
    NEW: 'New', CONTACTED: 'Contacted', REVIEW: 'Review', CONCEPT: 'Concept', COSTING: 'Costing',
    COSTING_REVIEW: 'Costing Review', OFFER_RELEASED: 'Offer Released', FOLLOW_UP: 'Follow-up',
    NEGOTIATION: 'Negotiation', NEGOTIATION_FOLLOW_UP: 'Negotiation Follow-up', WON: 'Won', LOST: 'Lost',
  };
  const TYPE = { GENERATED: 'Generated', INCOMING: 'Incoming' };
  const TEMP = { HOT: 'Hot', WARM: 'Warm', COLD: 'Cold' };

  /** Local calendar date as YYYY-MM-DD (reports are day-based). */
  const day = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const sum = (rows, key) => paise(rows.reduce((n, r) => n + (Number(r[key]) || 0), 0));

  /**
   * Per-customer / per-application breakdown, shared by both "-wise" reports:
   * raised, offers sent and won/lost in the period; open right now.
   * @param {'customer_id'|'application_id'} dim
   */
  async function breakdown(f, dim, names) {
    const [rates, raised, open, offers, won, lost] = await Promise.all([
      loadRates(), repository.raisedBy(f, dim), repository.openBy(f, dim), repository.offersSent(f),
      repository.won(f), repository.lost(f),
    ]);
    const groups = new Map();
    const g = (id) => {
      const k = id ?? 0; // 0 = none (e.g. no application set)
      if (!groups.has(k)) groups.set(k, { id: k, raised: 0, last_raised: null, open: 0, open_inr: 0, offers: 0, offered_inr: 0, won: 0, won_inr: 0, lost: 0 });
      return groups.get(k);
    };
    for (const r of raised) { const x = g(r[dim]); x.raised = r._count._all; x.last_raised = day(r._max.created_at); }
    for (const r of open) { const x = g(r[dim]); x.open += r._count._all; x.open_inr += toInr(r._sum.expected_value, r.currency_code, rates); }
    // Offers: the last priced offer sent per enquiry in the period.
    const lastOffer = new Map();
    for (const o of offers) lastOffer.set(o.enquiry_id, o);
    for (const o of lastOffer.values()) {
      const x = g(o.enquiry[dim]); x.offers += 1;
      x.offered_inr += toInr(o.offer_value, o.enquiry.currency_code, rates, o.offer_fx_rate);
    }
    for (const e of won) { const x = g(e[dim]); x.won += 1; x.won_inr += toInr(e.order_value, e.currency_code, rates, e.order_fx_rate); }
    for (const e of lost) g(e[dim]).lost += 1;

    const label = await names([...groups.keys()]);
    const rows = [...groups.values()]
      .map((x) => ({
        ...x, name: x.id ? label[x.id] ?? `#${x.id}` : '(none)',
        open_inr: paise(x.open_inr), offered_inr: paise(x.offered_inr), won_inr: paise(x.won_inr),
        win_rate: pct(x.won, x.won + x.lost),
      }))
      .sort((a, b) => b.won_inr - a.won_inr || b.open_inr - a.open_inr || a.name.localeCompare(b.name));
    const won_n = sum(rows, 'won');
    const lost_n = sum(rows, 'lost');
    return {
      rows,
      totals: {
        name: `Total · ${rows.length}`, raised: sum(rows, 'raised'), open: sum(rows, 'open'), open_inr: sum(rows, 'open_inr'),
        offers: sum(rows, 'offers'), offered_inr: sum(rows, 'offered_inr'), won: won_n, won_inr: sum(rows, 'won_inr'),
        lost: lost_n, win_rate: pct(won_n, won_n + lost_n),
      },
    };
  }

  const breakdownColumns = (nameLabel) => [
    { key: 'name', label: nameLabel, type: 'text' },
    { key: 'raised', label: 'Raised', type: 'int' },
    { key: 'last_raised', label: 'Last enquiry', type: 'date' },
    { key: 'open', label: 'Open now', type: 'int' },
    { key: 'open_inr', label: 'Open value (₹)', type: 'inr', hint: 'Right now, at the current rate' },
    { key: 'offers', label: 'Offers sent', type: 'int' },
    { key: 'offered_inr', label: 'Offered (₹)', type: 'inr', hint: 'Last priced offer sent per enquiry in the period' },
    { key: 'won', label: 'Won', type: 'int' },
    { key: 'won_inr', label: 'Won value (₹)', type: 'inr' },
    { key: 'lost', label: 'Lost', type: 'int' },
    { key: 'win_rate', label: 'Win rate %', type: 'pct' },
  ];

  const MEDIUMS = ['CALL', 'MEETING', 'TEAMS', 'SITE_VISIT', 'EMAIL'];

  /** One row per enquiry per month: the last offer it was sent that month. */
  function lastOfferPerMonth(offers) {
    const map = new Map();
    for (const o of offers) map.set(`${monthKey(o.sent_at)}|${o.enquiry_id}`, o); // oldest first → last wins
    return [...map.values()];
  }

  const reports = [
    // ── 1. Monthly Sales MIS ──────────────────────────────────────────────────
    {
      key: 'monthly-mis',
      title: 'Monthly Sales MIS',
      description: 'Month-wise enquiries raised, offers sent, orders won and lost, with values in ₹ and the win rate.',
      filters: ['period', 'owner', 'type', 'application', 'customer'],
      columns: [
        { key: 'month', label: 'Month', type: 'text' },
        { key: 'raised', label: 'Enquiries raised', type: 'int' },
        { key: 'offers', label: 'Offers sent', type: 'int', hint: 'Enquiries sent a priced offer that month' },
        { key: 'offered_inr', label: 'Offered value (₹)', type: 'inr' },
        { key: 'won', label: 'Orders won', type: 'int' },
        { key: 'won_inr', label: 'Won value (₹)', type: 'inr' },
        { key: 'lost', label: 'Lost', type: 'int' },
        { key: 'win_rate', label: 'Win rate %', type: 'pct' },
      ],
      async build(f) {
        const [rates, raised, offers, won, lost] = await Promise.all([
          loadRates(), repository.raisedDates(f), repository.offersSent(f), repository.won(f), repository.lost(f),
        ]);
        const months = [];
        for (let d = new Date(f.from.getFullYear(), f.from.getMonth(), 1); d < f.to && months.length < 60;
          d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
          months.push({
            key: monthKey(d),
            month: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
            raised: 0, offers: 0, offered_inr: 0, won: 0, won_inr: 0, lost: 0, win_rate: null,
          });
        }
        const at = Object.fromEntries(months.map((m) => [m.key, m]));
        for (const e of raised) if (at[monthKey(e.created_at)]) at[monthKey(e.created_at)].raised += 1;
        for (const o of lastOfferPerMonth(offers)) {
          const m = at[monthKey(o.sent_at)];
          if (m) { m.offers += 1; m.offered_inr += toInr(o.offer_value, o.enquiry.currency_code, rates, o.offer_fx_rate); }
        }
        for (const e of won) {
          const m = at[monthKey(e.won_at)];
          if (m) { m.won += 1; m.won_inr += toInr(e.order_value, e.currency_code, rates, e.order_fx_rate); }
        }
        for (const e of lost) if (at[monthKey(e.lost_at)]) at[monthKey(e.lost_at)].lost += 1;
        const rows = months.map(({ key: _k, ...m }) => ({
          ...m, offered_inr: paise(m.offered_inr), won_inr: paise(m.won_inr), win_rate: pct(m.won, m.won + m.lost),
        }));
        const won_n = rows.reduce((n, r) => n + r.won, 0);
        const lost_n = rows.reduce((n, r) => n + r.lost, 0);
        return {
          rows,
          totals: {
            month: 'Total', raised: sum(rows, 'raised'), offers: sum(rows, 'offers'), offered_inr: sum(rows, 'offered_inr'),
            won: won_n, won_inr: sum(rows, 'won_inr'), lost: lost_n, win_rate: pct(won_n, won_n + lost_n),
          },
        };
      },
    },

    // ── 2. Enquiry Register ───────────────────────────────────────────────────
    {
      key: 'enquiry-register',
      title: 'Enquiry Register',
      description: 'Every enquiry raised in the period with its customer, stage, owner, value, probability and weighted value.',
      filters: ['period', 'owner', 'type', 'application', 'customer', 'stage'],
      columns: [
        { key: 'ref_no', label: 'Ref', type: 'text', link: 'enquiry' },
        { key: 'created', label: 'Raised on', type: 'date' },
        { key: 'customer', label: 'Customer', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'application', label: 'Application', type: 'text' },
        { key: 'stage', label: 'Stage', type: 'text' },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'holder', label: 'With', type: 'text' },
        { key: 'currency', label: 'Currency', type: 'text' },
        { key: 'value', label: 'Expected value', type: 'amount' },
        { key: 'value_inr', label: 'Value (₹)', type: 'inr', hint: 'Won: order value at the locked rate; otherwise expected value at the current rate' },
        { key: 'probability', label: 'Probability %', type: 'pct' },
        { key: 'weighted_inr', label: 'Weighted (₹)', type: 'inr' },
        { key: 'temperature', label: 'Temperature', type: 'text' },
        { key: 'days_in_stage', label: 'Days in stage', type: 'int' },
        { key: 'expected_close', label: 'Expected close', type: 'date' },
      ],
      async build(f) {
        const [rates, probability, rows] = await Promise.all([loadRates(), config.probabilityMap(), repository.register(f)]);
        const now = Date.now();
        const out = rows.map((e) => {
          const won = e.stage === 'WON';
          const amount = won ? e.order_value : e.expected_value;
          // No amount entered → blank, not ₹0.
          const valueInr = amount === null ? null : won
            ? toInr(e.order_value, e.currency_code, rates, e.order_fx_rate)
            : toInr(e.expected_value, e.currency_code, rates);
          const p = probability[e.stage] ?? 0;
          const closed = won || e.stage === 'LOST';
          return {
            id: e.id,
            ref_no: e.ref_no,
            created: day(e.created_at),
            customer: e.customer?.name ?? null,
            title: e.title,
            type: TYPE[e.enquiry_type] ?? e.enquiry_type,
            application: e.application?.name ?? null,
            stage: STAGE[e.stage] ?? e.stage,
            owner: e.owner?.name ?? null,
            holder: closed ? null : (e.handler ?? e.owner)?.name ?? null,
            currency: e.currency_code,
            value: num(amount),
            value_inr: valueInr === null ? null : paise(valueInr),
            probability: p,
            weighted_inr: valueInr === null ? null : paise(e.stage === 'LOST' ? 0 : valueInr * (p / 100)),
            temperature: e.current_temperature ? TEMP[e.current_temperature] : null,
            days_in_stage: closed ? null : Math.floor((now - e.stage_since.getTime()) / DAY_MS),
            expected_close: day(e.expected_close),
          };
        });
        return {
          rows: out,
          totals: { ref_no: `Total · ${out.length}`, value_inr: sum(out, 'value_inr'), weighted_inr: sum(out, 'weighted_inr') },
        };
      },
    },

    // ── 3. Won Orders Register ────────────────────────────────────────────────
    {
      key: 'won-orders',
      title: 'Won Orders Register',
      description: 'Orders won in the period: PO details, order value with its locked ₹ rate, final offer and discount, days to close.',
      filters: ['period', 'owner', 'type', 'application', 'customer'],
      columns: [
        { key: 'ref_no', label: 'Ref', type: 'text', link: 'enquiry' },
        { key: 'won_on', label: 'Won on', type: 'date' },
        { key: 'customer', label: 'Customer', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'application', label: 'Application', type: 'text' },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'po_no', label: 'PO number', type: 'text' },
        { key: 'po_date', label: 'PO date', type: 'date' },
        { key: 'currency', label: 'Currency', type: 'text' },
        { key: 'order_value', label: 'Order value', type: 'amount' },
        { key: 'rate', label: 'Rate (₹)', type: 'rate', hint: 'Locked when the order was won' },
        { key: 'order_inr', label: 'Order value (₹)', type: 'inr' },
        { key: 'final_offer', label: 'Final offer', type: 'amount' },
        { key: 'discount', label: 'Discount %', type: 'pct', hint: 'Final offer → order' },
        { key: 'days_to_close', label: 'Days to close', type: 'int' },
      ],
      async build(f) {
        const [rates, won] = await Promise.all([loadRates(), repository.won(f)]);
        const offers = Object.fromEntries(
          (await repository.finalOffers(won.map((e) => e.id))).map((o) => [o.enquiry_id, Number(o.offer_value)])
        );
        const rows = won.map((e) => {
          const rate = num(e.order_fx_rate) ?? rates[e.currency_code] ?? 1;
          const order = Number(e.order_value);
          const offer = offers[e.id] ?? null;
          return {
            id: e.id,
            ref_no: e.ref_no,
            won_on: day(e.won_at),
            customer: e.customer?.name ?? null,
            title: e.title,
            application: e.application?.name ?? null,
            owner: e.owner?.name ?? null,
            po_no: e.order_no,
            po_date: day(e.order_date),
            currency: e.currency_code,
            order_value: order,
            rate,
            order_inr: paise(order * rate),
            final_offer: offer,
            discount: offer ? Math.round(((offer - order) / offer) * 1000) / 10 : null,
            days_to_close: Math.round((e.won_at.getTime() - e.created_at.getTime()) / DAY_MS),
          };
        });
        const discounts = rows.filter((r) => r.discount !== null);
        return {
          rows,
          totals: {
            ref_no: `Total · ${rows.length}`,
            order_inr: sum(rows, 'order_inr'),
            discount: discounts.length ? Math.round((discounts.reduce((n, r) => n + r.discount, 0) / discounts.length) * 10) / 10 : null,
            days_to_close: rows.length ? Math.round(rows.reduce((n, r) => n + r.days_to_close, 0) / rows.length) : null,
          },
          notes: ['The totals row shows the average discount and average days to close.'],
        };
      },
    },

    // ── 4. Lost Enquiries ─────────────────────────────────────────────────────
    {
      key: 'lost-enquiries',
      title: 'Lost Enquiries',
      description: 'Enquiries lost in the period: the stage lost at, the reason, who the deal went to, and the value lost.',
      filters: ['period', 'owner', 'type', 'application', 'customer'],
      columns: [
        { key: 'ref_no', label: 'Ref', type: 'text', link: 'enquiry' },
        { key: 'lost_on', label: 'Lost on', type: 'date' },
        { key: 'customer', label: 'Customer', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'application', label: 'Application', type: 'text' },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'lost_at_stage', label: 'Lost at stage', type: 'text' },
        { key: 'reason', label: 'Reason', type: 'text' },
        { key: 'went_to', label: 'Went to', type: 'text' },
        { key: 'currency', label: 'Currency', type: 'text' },
        { key: 'value', label: 'Expected value', type: 'amount' },
        { key: 'value_inr', label: 'Value lost (₹)', type: 'inr', hint: 'At the current rate' },
      ],
      async build(f) {
        const [rates, lost] = await Promise.all([loadRates(), repository.lost(f)]);
        const rows = lost.map((e) => ({
          id: e.id,
          ref_no: e.ref_no,
          lost_on: day(e.lost_at),
          customer: e.customer?.name ?? null,
          title: e.title,
          application: e.application?.name ?? null,
          owner: e.owner?.name ?? null,
          lost_at_stage: STAGE[e.stageEvents[0]?.from_stage] ?? null,
          reason: e.lost_reason,
          went_to: e.lost_to,
          currency: e.currency_code,
          value: num(e.expected_value),
          value_inr: e.expected_value === null ? null : paise(toInr(e.expected_value, e.currency_code, rates)),
        }));
        return { rows, totals: { ref_no: `Total · ${rows.length}`, value_inr: sum(rows, 'value_inr') } };
      },
    },

    // ── 5. Offer Register ─────────────────────────────────────────────────────
    {
      key: 'offer-register',
      title: 'Offer Register',
      description: 'Every offer revision uploaded in the period: price, ₹ value, when and by whom it was sent, and the enquiry outcome.',
      filters: ['period', 'owner', 'type', 'application', 'customer'],
      columns: [
        { key: 'ref_no', label: 'Ref', type: 'text', link: 'enquiry' },
        { key: 'customer', label: 'Customer', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'rev', label: 'Rev', type: 'int' },
        { key: 'uploaded', label: 'Uploaded on', type: 'date' },
        { key: 'stage_at_upload', label: 'Added at', type: 'text' },
        { key: 'currency', label: 'Currency', type: 'text' },
        { key: 'price', label: 'Price', type: 'amount' },
        { key: 'price_inr', label: 'Price (₹)', type: 'inr', hint: 'Sent offers at the rate when sent; unsent at the current rate' },
        { key: 'sent_on', label: 'Sent on', type: 'date' },
        { key: 'sent_by', label: 'Sent by', type: 'text' },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'outcome', label: 'Enquiry now', type: 'text' },
      ],
      async build(f) {
        const [rates, offers] = await Promise.all([loadRates(), repository.offers(f)]);
        const names = await repository.userNames(offers.map((o) => o.sent_by));
        const rows = offers.map((o) => ({
          id: o.enquiry.id,
          ref_no: o.enquiry.ref_no,
          customer: o.enquiry.customer?.name ?? null,
          title: o.enquiry.title,
          rev: o.version,
          uploaded: day(o.created_at),
          stage_at_upload: STAGE[o.stage] ?? null,
          currency: o.enquiry.currency_code,
          price: num(o.offer_value),
          price_inr: o.offer_value === null ? null
            : paise(toInr(o.offer_value, o.enquiry.currency_code, rates, o.sent_at ? o.offer_fx_rate : null)),
          sent_on: day(o.sent_at),
          sent_by: o.sent_by ? names[o.sent_by] ?? null : null,
          owner: o.enquiry.owner?.name ?? null,
          outcome: STAGE[o.enquiry.stage] ?? o.enquiry.stage,
        }));
        const sent = rows.filter((r) => r.sent_on).length;
        return {
          rows,
          totals: { ref_no: `Total · ${rows.length} (${sent} sent)`, price_inr: sum(rows, 'price_inr') },
        };
      },
    },

    // ── 6. Salesperson Performance ────────────────────────────────────────────
    {
      key: 'salesperson-performance',
      title: 'Salesperson Performance',
      description: 'Per field person: enquiries raised, open now, offers sent, orders won and lost, win rate and follow-ups logged.',
      filters: ['period', 'owner', 'type', 'application', 'customer'],
      columns: [
        { key: 'name', label: 'Field person', type: 'text' },
        { key: 'raised', label: 'Raised', type: 'int' },
        { key: 'open', label: 'Open now', type: 'int' },
        { key: 'open_inr', label: 'Open value (₹)', type: 'inr', hint: 'Right now, at the current rate' },
        { key: 'offers', label: 'Offers sent', type: 'int' },
        { key: 'won', label: 'Won', type: 'int' },
        { key: 'won_inr', label: 'Won value (₹)', type: 'inr' },
        { key: 'lost', label: 'Lost', type: 'int' },
        { key: 'win_rate', label: 'Win rate %', type: 'pct' },
        { key: 'activities', label: 'Follow-ups logged', type: 'int', hint: 'Calls, meetings, visits and emails they logged in the period' },
      ],
      async build(f) {
        const [rates, raised, open, offers, won, lost, activities] = await Promise.all([
          loadRates(), repository.raisedByOwner(f), repository.openByOwner(f), repository.offersSent(f),
          repository.won(f), repository.lost(f), repository.activitiesByLogger(f),
        ]);
        const people = new Map();
        const row = (id) => {
          if (!people.has(id)) people.set(id, { id, raised: 0, open: 0, open_inr: 0, offers: 0, won: 0, won_inr: 0, lost: 0, activities: 0 });
          return people.get(id);
        };
        for (const r of raised) row(r.owner_id).raised = r._count._all;
        for (const r of open) { const p = row(r.owner_id); p.open += r._count._all; p.open_inr += toInr(r._sum.expected_value, r.currency_code, rates); }
        for (const o of offers) row(o.enquiry.owner_id).offers += 1;
        for (const e of won) { const p = row(e.owner_id); p.won += 1; p.won_inr += toInr(e.order_value, e.currency_code, rates, e.order_fx_rate); }
        for (const e of lost) row(e.owner_id).lost += 1;
        // Follow-ups count for whoever logged them — only for people already
        // in the table (field owners), so internal reviewers don't add rows.
        for (const a of activities) if (a.created_by && people.has(a.created_by)) people.get(a.created_by).activities = a._count._all;
        if (f.ownerId) for (const id of [...people.keys()]) if (id !== f.ownerId) people.delete(id);

        const names = await repository.userNames([...people.keys()]);
        const rows = [...people.values()]
          .map((p) => ({
            ...p, name: names[p.id] ?? `User #${p.id}`,
            open_inr: paise(p.open_inr), won_inr: paise(p.won_inr), win_rate: pct(p.won, p.won + p.lost),
          }))
          .sort((a, b) => b.won_inr - a.won_inr || b.open_inr - a.open_inr || a.name.localeCompare(b.name));
        const won_n = sum(rows, 'won');
        const lost_n = sum(rows, 'lost');
        return {
          rows,
          totals: {
            name: 'Total', raised: sum(rows, 'raised'), open: sum(rows, 'open'), open_inr: sum(rows, 'open_inr'),
            offers: sum(rows, 'offers'), won: won_n, won_inr: sum(rows, 'won_inr'), lost: lost_n,
            win_rate: pct(won_n, won_n + lost_n), activities: sum(rows, 'activities'),
          },
        };
      },
    },
    // ── 7. Customer-wise ──────────────────────────────────────────────────────
    {
      key: 'customer-wise',
      title: 'Customer-wise Report',
      description: 'Per customer: enquiries raised, open now, offers sent, orders won and lost, values in ₹ and the win rate.',
      filters: ['period', 'owner', 'type', 'application'],
      columns: breakdownColumns('Customer'),
      build: (f) => breakdown(f, 'customer_id', (ids) => repository.customerNames(ids)),
    },

    // ── 8. Application-wise ───────────────────────────────────────────────────
    {
      key: 'application-wise',
      title: 'Application-wise Report',
      description: 'Per application (Annealing, Hardening, …): enquiries raised, open now, offers sent, orders won and lost, values in ₹.',
      filters: ['period', 'owner', 'type', 'customer'],
      columns: breakdownColumns('Application'),
      build: (f) => breakdown(f, 'application_id', (ids) => repository.applicationNames(ids)),
    },

    // ── 9. Follow-up & Activity ───────────────────────────────────────────────
    {
      key: 'followup-activity',
      title: 'Follow-up & Activity Report',
      description: 'Per person: customer interactions logged in the period by kind, reviews held, follow-ups scheduled, and follow-ups overdue right now.',
      filters: ['period', 'owner', 'type', 'application', 'customer'],
      columns: [
        { key: 'name', label: 'Person', type: 'text' },
        { key: 'CALL', label: 'Calls', type: 'int' },
        { key: 'MEETING', label: 'Meetings', type: 'int' },
        { key: 'TEAMS', label: 'Teams', type: 'int' },
        { key: 'SITE_VISIT', label: 'Site visits', type: 'int' },
        { key: 'EMAIL', label: 'Emails', type: 'int' },
        { key: 'total', label: 'Total interactions', type: 'int' },
        { key: 'reviews', label: 'Reviews held', type: 'int', hint: 'Internal review meetings logged' },
        { key: 'scheduled', label: 'Follow-ups scheduled', type: 'int', hint: 'Interactions that set a next follow-up date' },
        { key: 'overdue', label: 'Overdue now', type: 'int', hint: 'Follow-ups past their date on enquiries this person holds right now' },
      ],
      async build(f) {
        const [counts, scheduled, overdue] = await Promise.all([
          repository.activityCounts(f), repository.followupsScheduled(f), repository.overdueFollowups(f),
        ]);
        const people = new Map();
        const p = (id) => {
          if (!people.has(id)) people.set(id, { id, CALL: 0, MEETING: 0, TEAMS: 0, SITE_VISIT: 0, EMAIL: 0, total: 0, reviews: 0, scheduled: 0, overdue: 0 });
          return people.get(id);
        };
        for (const c of counts) {
          if (!c.created_by) continue;
          const x = p(c.created_by);
          if (c.is_review) x.reviews += c._count._all;
          else { x[c.type] += c._count._all; x.total += c._count._all; }
        }
        for (const c of scheduled) if (c.created_by) p(c.created_by).scheduled = c._count._all;
        for (const o of overdue) {
          const holder = o.enquiry.handler_id ?? o.enquiry.owner_id;
          if (holder) p(holder).overdue += 1;
        }
        const names = await repository.userNames([...people.keys()]);
        const rows = [...people.values()]
          .map((x) => ({ ...x, name: names[x.id] ?? `User #${x.id}` }))
          .sort((a, b) => b.total - a.total || b.overdue - a.overdue || a.name.localeCompare(b.name));
        const totals = { name: 'Total' };
        for (const k of [...MEDIUMS, 'total', 'reviews', 'scheduled', 'overdue']) totals[k] = sum(rows, k);
        return { rows, totals };
      },
    },

    // ── 10. Stalled / Aging ───────────────────────────────────────────────────
    {
      key: 'stalled-aging',
      title: 'Stalled / Aging Report',
      description: 'Every open enquiry right now with how long it has sat in its stage against the stage limit — stalled ones first.',
      filters: ['owner', 'type', 'application', 'customer', 'stage'],
      columns: [
        { key: 'ref_no', label: 'Ref', type: 'text', link: 'enquiry' },
        { key: 'customer', label: 'Customer', type: 'text' },
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'stage', label: 'Stage', type: 'text' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'days_in_stage', label: 'Days in stage', type: 'int' },
        { key: 'limit', label: 'Stage limit (days)', type: 'int' },
        { key: 'over_by', label: 'Over by (days)', type: 'int' },
        { key: 'holder', label: 'With', type: 'text' },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'last_activity', label: 'Last activity', type: 'date' },
        { key: 'age', label: 'Enquiry age (days)', type: 'int' },
        { key: 'currency', label: 'Currency', type: 'text' },
        { key: 'value', label: 'Expected value', type: 'amount' },
        { key: 'value_inr', label: 'Value (₹)', type: 'inr', hint: 'At the current rate' },
        { key: 'temperature', label: 'Temperature', type: 'text' },
      ],
      async build(f) {
        const [rates, open] = await Promise.all([loadRates(), repository.openEnquiries(f)]);
        const last = await repository.lastActivity(open.map((e) => e.id));
        const now = Date.now();
        const rows = open
          .filter((e) => e.stage !== 'WON' && e.stage !== 'LOST')
          .map((e) => {
            const days = Math.floor((now - e.stage_since.getTime()) / DAY_MS);
            const limit = STAGE_AGING_DAYS[e.stage] ?? null;
            const over = limit === null ? null : days - limit;
            return {
              id: e.id,
              ref_no: e.ref_no,
              customer: e.customer?.name ?? null,
              title: e.title,
              stage: STAGE[e.stage] ?? e.stage,
              status: over !== null && over >= 0 ? 'Stalled' : 'Within limit',
              days_in_stage: days,
              limit,
              over_by: over !== null && over >= 0 ? over : null,
              holder: (e.handler ?? e.owner)?.name ?? null,
              owner: e.owner?.name ?? null,
              last_activity: day(last[e.id] ?? null),
              age: Math.floor((now - e.created_at.getTime()) / DAY_MS),
              currency: e.currency_code,
              value: num(e.expected_value),
              value_inr: e.expected_value === null ? null : paise(toInr(e.expected_value, e.currency_code, rates)),
              temperature: e.current_temperature ? TEMP[e.current_temperature] : null,
            };
          })
          // Stalled first, most overdue first; then the rest by days in stage.
          .sort((a, b) => (b.over_by ?? -1) - (a.over_by ?? -1) || b.days_in_stage - a.days_in_stage);
        const stalled = rows.filter((r) => r.status === 'Stalled');
        return {
          rows,
          totals: {
            ref_no: `Total · ${rows.length} open (${stalled.length} stalled)`,
            value_inr: sum(rows, 'value_inr'),
          },
          notes: ['Shows the position right now — the period does not apply. A stage is stalled once its days reach the stage limit.'],
        };
      },
    },
  ];

  return {
    reports,
    /** @param {string} key */
    find(key) {
      return reports.find((r) => r.key === key) || null;
    },
  };
}

const salesReports = createSalesReports(salesReportsRepository);

module.exports = { salesReports, createSalesReports };
