/**
 * Follow-up reminder plan — which reminder is due, pinned down (no database).
 *
 * Run:  node --test tests/unit/reminderPlan.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { dueReminder, effectiveOffsets, lookahead } = require('../../src/modules/sales/reminderPlan');

const H = 60 * 60 * 1000;
const M = 60 * 1000;
const at = new Date('2031-03-14T04:30:00.000Z'); // a site visit, 10:00 IST
const SITE = [1440, 180, 15];
const longAgo = new Date(at.getTime() - 3 * 24 * H); // booked three days ahead

const due = (now, extra = {}) => dueReminder({ at, timed: true, offsets: SITE, armedAt: longAgo, now, ...extra });

describe('reminderPlan', () => {
  test('nothing before the first reminder time', () => {
    assert.equal(due(new Date(at.getTime() - 25 * H)), null);
  });

  test('a site visit booked days ahead gets 24 h, then 3 h, then 15 min — each once', () => {
    assert.deepEqual(due(new Date(at.getTime() - 24 * H)), { offset: 1440, final: false });
    assert.equal(due(new Date(at.getTime() - 23 * H), { sentOffset: 1440 }), null, '24 h not again');
    assert.deepEqual(due(new Date(at.getTime() - 3 * H), { sentOffset: 1440 }), { offset: 180, final: false });
    assert.equal(due(new Date(at.getTime() - 1 * H), { sentOffset: 180 }), null);
    assert.deepEqual(due(new Date(at.getTime() - 15 * M), { sentOffset: 180 }), { offset: 15, final: true });
  });

  test('no catching up: after a missed stretch only the latest reminder goes', () => {
    // Server down from before the 24 h mark until 2 h before: the 3 h one goes, not both.
    assert.deepEqual(due(new Date(at.getTime() - 2 * H)), { offset: 180, final: false });
  });

  test('booked 5 hours ahead: no "24 h" reminder; the 3 h and 15 min ones still go', () => {
    const armedAt = new Date(at.getTime() - 5 * H);
    assert.equal(due(new Date(at.getTime() - 4 * H), { armedAt }), null, 'the 24 h time had passed when it was booked');
    assert.deepEqual(due(new Date(at.getTime() - 3 * H), { armedAt }), { offset: 180, final: false });
  });

  test('booked 10 minutes ahead: the final reminder still goes', () => {
    const armedAt = new Date(at.getTime() - 10 * M);
    assert.deepEqual(due(new Date(at.getTime() - 9 * M), { armedAt }), { offset: 15, final: true });
  });

  test('an overdue follow-up gets only its final reminder', () => {
    assert.deepEqual(due(new Date(at.getTime() + 2 * H)), { offset: 15, final: true });
  });

  test('a single-reminder kind behaves as before (15 minutes before, once)', () => {
    const d = (now) => dueReminder({ at, timed: true, offsets: [15], now });
    assert.equal(d(new Date(at.getTime() - 30 * M)), null);
    assert.deepEqual(d(new Date(at.getTime() - 15 * M)), { offset: 15, final: true });
  });

  test('date-only: whole days only, plus that morning', () => {
    assert.deepEqual(effectiveOffsets(SITE, false), [1440, 0]);
    assert.deepEqual(effectiveOffsets([15], false), [0]);
    assert.deepEqual(effectiveOffsets([2000, 1440], false), [1440, 0], 'rounded down to whole days, de-duplicated');
    const d = (now, sentOffset = null) => dueReminder({ at, timed: false, offsets: SITE, sentOffset, armedAt: longAgo, now });
    assert.deepEqual(d(new Date(at.getTime() - 24 * H)), { offset: 1440, final: false }, 'the morning before');
    assert.deepEqual(d(at, 1440), { offset: 0, final: true }, 'that morning');
  });

  test('lookahead covers the earliest reminder of any kind', () => {
    assert.deepEqual(lookahead([[15], SITE, [60]]), { timedMin: 1440, dayMin: 1440 });
    assert.deepEqual(lookahead([[15]]), { timedMin: 15, dayMin: 0 });
  });
});
