const { analyticsRepository } = require('./analytics.repository');
const { salesConfigService } = require('./config.service');
const { loadRates, toInr, paise } = require('../master/fx');

/**
 * Sales dashboard business logic: turns the repository's rows into the
 * numbers the Sales → Dashboard page shows. Pure arithmetic over a filtered
 * slice of enquiries; no writes.
 *
 * @param {ReturnType<typeof import('./analytics.repository').createAnalyticsRepository>} repository
 * @param {{ probabilityMap: () => Promise<Record<string, number>> }} [config]
 */
function createAnalyticsService(repository, config = salesConfigService) {
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Pipeline order used to decide how far an enquiry got. LOST is not a rung.
  const ORDER = [
    'NEW', 'CONTACTED', 'REVIEW', 'CONCEPT', 'COSTING', 'COSTING_REVIEW',
    'OFFER_RELEASED', 'FOLLOW_UP', 'NEGOTIATION', 'NEGOTIATION_FOLLOW_UP', 'WON',
  ];
  const RANK = Object.fromEntries(ORDER.map((s, i) => [s, i]));

  // Funnel rungs: "reached X" means the enquiry got to X or anything after it.
  const FUNNEL = [
    { key: 'RAISED', label: 'Raised', rank: 0 },
    { key: 'REVIEW', label: 'Review', rank: RANK.REVIEW },
    { key: 'CONCEPT', label: 'Concept', rank: RANK.CONCEPT },
    { key: 'COSTING', label: 'Costing', rank: RANK.COSTING },
    { key: 'OFFER_RELEASED', label: 'Offer released', rank: RANK.OFFER_RELEASED },
    { key: 'WON', label: 'Won', rank: RANK.WON },
  ];

  // Stages that can be "waited in" (time-in-stage), in pipeline order.
  const TIMED = ORDER.filter((s) => s !== 'WON');

  const num = (d) => (d === null || d === undefined ? 0 : Number(d));
  const round1 = (n) => Math.round(n * 10) / 10;
  const rate = (won, lost) => (won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null);

  /** Groups free-text values case-insensitively, keeping the first spelling seen. */
  function tally(values, emptyLabel) {
    const map = new Map();
    for (const raw of values) {
      const label = (raw || '').trim() || emptyLabel;
      const key = label.toLowerCase();
      const row = map.get(key) || { label, count: 0 };
      row.count += 1;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  /** Resolves the request query to a concrete filter (`to` exclusive). */
  function toFilter(query) {
    const to = query.to ? new Date(query.to) : new Date();
    to.setHours(0, 0, 0, 0);
    to.setDate(to.getDate() + 1); // include the whole "to" day
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 90 * DAY_MS);
    from.setHours(0, 0, 0, 0);
    return { from, to, ownerId: query.owner_id, type: query.enquiry_type, applicationId: query.application_id };
  }

  function funnel(raised) {
    const counts = FUNNEL.map(() => 0);
    for (const e of raised) {
      let reached = e.stage === 'LOST' ? 0 : RANK[e.stage] ?? 0;
      for (const ev of e.stageEvents) {
        if (ev.to_stage !== 'LOST') reached = Math.max(reached, RANK[ev.to_stage] ?? 0);
      }
      FUNNEL.forEach((step, i) => { if (reached >= step.rank) counts[i] += 1; });
    }
    return FUNNEL.map((step, i) => ({ key: step.key, label: step.label, count: counts[i] }));
  }

  function timeInStage(enquiries, f) {
    const sums = Object.fromEntries(TIMED.map((s) => [s, { total: 0, n: 0 }]));
    for (const e of enquiries) {
      const trail = e.stageEvents;
      for (let i = 1; i < trail.length; i += 1) {
        const exit = trail[i].created_at;
        if (exit < f.from || exit >= f.to) continue;
        const stage = trail[i - 1].to_stage;
        if (!sums[stage]) continue;
        sums[stage].total += exit.getTime() - trail[i - 1].created_at.getTime();
        sums[stage].n += 1;
      }
    }
    return TIMED
      .filter((s) => sums[s].n > 0)
      .map((s) => ({ stage: s, avg_days: round1(sums[s].total / sums[s].n / DAY_MS), samples: sums[s].n }));
  }

  /** Last 12 calendar months up to the month of the period's end. */
  function monthly(closed, f, rates) {
    const last = new Date(f.to.getTime() - 1);
    const months = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(last.getFullYear(), last.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, won: 0, lost: 0, won_value: 0 });
    }
    const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
    for (const e of closed) {
      const at = e.stage === 'WON' ? e.won_at : e.lost_at;
      if (!at) continue;
      const m = byKey[`${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`];
      if (!m) continue;
      if (e.stage === 'WON') { m.won += 1; m.won_value += toInr(e.order_value, e.currency_code, rates, e.order_fx_rate); } else m.lost += 1;
    }
    for (const m of months) m.won_value = Math.round(m.won_value);
    return months;
  }

  return {
    /**
     * @param {{ from?: Date, to?: Date, owner_id?: number, enquiry_type?: string }} query
     */
    async overview(query) {
      const f = toFilter(query);
      const lastDay = new Date(f.to.getTime() - 1);
      const trendFrom = new Date(lastDay.getFullYear(), lastDay.getMonth() - 11, 1);

      // Every money figure below is in INR: open amounts at today's rate, won
      // orders at the rate locked when they were won.
      const [rates, openRows, stageRows, probability, won, lost, raised, exits, closed, stalled, hot, overdue, owners] = await Promise.all([
        loadRates(),
        repository.openByOwner(f),
        repository.openByStage(f),
        config.probabilityMap(),
        repository.won(f),
        repository.lost(f),
        repository.raised(f),
        repository.withStageExits(f),
        repository.closedSince(f, trendFrom),
        repository.stalled(f),
        repository.hot(f),
        repository.overdueFollowups(f),
        repository.owners(),
      ]);

      const orderInr = (e) => toInr(e.order_value, e.currency_code, rates, e.order_fx_rate);
      const openInr = (r) => toInr(r._sum.expected_value, r.currency_code, rates);
      const wonValue = Math.round(won.reduce((n, e) => n + orderInr(e), 0));
      const daysToClose = won.map((e) => (e.won_at.getTime() - e.created_at.getTime()) / DAY_MS);

      // ── Team performance: one row per field initiator seen in any block ──
      const team = new Map();
      const row = (id) => {
        if (!team.has(id)) team.set(id, { owner_id: id, raised: 0, open: 0, open_value: 0, won: 0, won_value: 0, lost: 0 });
        return team.get(id);
      };
      for (const r of openRows) { const t = row(r.owner_id); t.open += r._count._all; t.open_value += openInr(r); }
      for (const e of raised) row(e.owner_id).raised += 1;
      for (const e of won) { const t = row(e.owner_id); t.won += 1; t.won_value += orderInr(e); }
      for (const e of lost) row(e.owner_id).lost += 1;
      const names = Object.fromEntries(
        (await repository.usersByIds([...team.keys()])).map((u) => [u.id, u.name])
      );

      return {
        period: { from: f.from, to: lastDay },
        owners,
        headline: {
          open_count: openRows.reduce((n, r) => n + r._count._all, 0),
          open_value: Math.round(openRows.reduce((n, r) => n + openInr(r), 0)),
          // Expected value × the stage's win probability, summed.
          weighted_value: Math.round(stageRows.reduce(
            (n, r) => n + openInr(r) * ((probability[r.stage] ?? 0) / 100), 0
          )),
          raised: raised.length,
          won: won.length,
          won_value: wonValue,
          lost: lost.length,
          win_rate: rate(won.length, lost.length),
          avg_deal: won.length ? Math.round(wonValue / won.length) : null,
          avg_days_to_close: daysToClose.length
            ? round1(daysToClose.reduce((a, b) => a + b, 0) / daysToClose.length)
            : null,
        },
        funnel: funnel(raised),
        time_in_stage: timeInStage(exits, f),
        monthly: monthly(closed, f, rates),
        lost: {
          total: lost.length,
          reasons: tally(lost.map((e) => e.lost_reason), 'No reason given').slice(0, 8),
          competitors: tally(lost.map((e) => e.lost_to), 'Not known').slice(0, 8),
          by_stage: tally(lost.map((e) => e.stageEvents[0]?.from_stage || ''), 'Unknown'),
        },
        team: [...team.values()]
          .map((t) => ({
            ...t, open_value: Math.round(t.open_value), won_value: Math.round(t.won_value),
            name: names[t.owner_id] || `User #${t.owner_id}`, win_rate: rate(t.won, t.lost),
          }))
          .sort((a, b) => b.won_value - a.won_value || b.open_value - a.open_value || a.name.localeCompare(b.name)),
        watch: {
          stalled: { total: stalled.total, items: stalled.items },
          hot: {
            total: hot.total,
            items: hot.items
              .map((e) => ({
                ...e,
                expected_value: e.expected_value === null ? null : num(e.expected_value),
                expected_value_inr: e.expected_value === null ? null : paise(toInr(e.expected_value, e.currency_code, rates)),
              }))
              .sort((a, b) => (b.expected_value_inr ?? -1) - (a.expected_value_inr ?? -1))
              .slice(0, 15),
          },
          overdue,
        },
      };
    },
  };
}

const analyticsService = createAnalyticsService(analyticsRepository);

module.exports = { analyticsService, createAnalyticsService };
