'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MEDIUM_LABEL, STAGE_STYLE, TEMPERATURE_STYLE, followUpDoneText } from '@/lib/salesOptions';

/**
 * The follow-ups calendar, laid out like the Teams calendar: Day, Work week and
 * Week on an hour grid (timed follow-ups as blocks at their time, date-only
 * ones in an all-day strip on top, a red line at the current time) and a Month
 * grid. Clicking a follow-up opens a card with its details, Open enquiry and —
 * for your own open one — Reschedule.
 */

const ENQ = '/dashboard/sales/enquiries';
const HOUR_PX = 48;
const BLOCK_MIN = 30; // a follow-up has no length — shown as half an hour
const MODES = [
  { key: 'day', label: 'Day' },
  { key: 'workweek', label: 'Work week' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Block colours by state: a left bar and a light fill, as in Teams. */
const TONE = {
  OVERDUE: { bar: '#dc2626', cls: 'bg-red-50 text-red-800 hover:bg-red-100' },
  TODAY: { bar: '#d97706', cls: 'bg-amber-50 text-amber-900 hover:bg-amber-100' },
  UPCOMING: { bar: '#2563eb', cls: 'bg-blue-50 text-blue-800 hover:bg-blue-100' },
  DONE: { bar: '#16a34a', cls: 'bg-green-50 text-green-800 hover:bg-green-100' },
};
const STATUS_LABEL = { OVERDUE: 'Overdue', TODAY: 'Today', UPCOMING: 'Upcoming', DONE: 'Done' };

export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const monday = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const time = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const longDay = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** The days a view shows. @returns {{ days: Date[], start: Date, end: Date }} (end inclusive) */
export function calendarRange(mode, anchor) {
  let days;
  if (mode === 'day') days = [startOfDay(anchor)];
  else if (mode === 'workweek') days = Array.from({ length: 5 }, (_, i) => addDays(monday(anchor), i));
  else if (mode === 'week') days = Array.from({ length: 7 }, (_, i) => addDays(monday(anchor), i));
  else {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    days = Array.from({ length: 42 }, (_, i) => addDays(monday(first), i));
  }
  return { days, start: days[0], end: days[days.length - 1] };
}

/** The anchor date moved one view back (-1) or forward (1). */
export function stepAnchor(mode, anchor, n) {
  if (mode === 'day') return addDays(anchor, n);
  if (mode === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + n, 1);
  return addDays(anchor, 7 * n);
}

function rangeTitle(mode, anchor, days) {
  if (mode === 'day') return anchor.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (mode === 'month') return anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const a = days[0]; const b = days[days.length - 1];
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${b.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
  if (a.getFullYear() === b.getFullYear()) return `${a.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `${a.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} – ${b.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/**
 * Side-by-side columns for timed follow-ups that overlap (each is BLOCK_MIN
 * long): returns id → { col, cols }.
 */
function layoutDay(list) {
  const out = new Map();
  const mins = (f) => { const d = new Date(f.follow_up_at); return d.getHours() * 60 + d.getMinutes(); };
  const sorted = [...list].sort((a, b) => mins(a) - mins(b));
  let group = []; let groupEnd = -1;
  const flush = () => {
    const ends = []; // end minute per column
    const placed = group.map((f) => {
      const m = mins(f);
      let col = ends.findIndex((e) => e <= m);
      if (col === -1) { col = ends.length; ends.push(0); }
      ends[col] = m + BLOCK_MIN;
      return [f.id, col];
    });
    for (const [id, col] of placed) out.set(id, { col, cols: ends.length });
    group = [];
  };
  for (const f of sorted) {
    const m = mins(f);
    if (group.length && m >= groupEnd) flush();
    group.push(f);
    groupEnd = Math.max(groupEnd, m + BLOCK_MIN);
  }
  if (group.length) flush();
  return out;
}

/** The details card for a clicked follow-up, near where it was clicked. */
function FollowupCard({ pick, canReschedule, onReschedule, onClose }) {
  const { f, x, y } = pick;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const W = 340;
  const left = Math.max(8, Math.min(x + 12, (typeof window !== 'undefined' ? window.innerWidth : 1200) - W - 8));
  const top = Math.max(8, Math.min(y - 40, (typeof window !== 'undefined' ? window.innerHeight : 800) - 330));
  const tone = TONE[f.status] || TONE.UPCOMING;
  const stage = STAGE_STYLE[f.enquiry.stage];
  const temp = f.temperature ? TEMPERATURE_STYLE[f.temperature] : null;
  const open = f.status !== 'DONE';
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-label={`Follow-up ${f.enquiry.ref_no}`} style={{ left, top, width: W, borderTopColor: tone.bar }}
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 border-t-4 p-4 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: tone.bar }}>
              {STATUS_LABEL[f.status]}{f.status === 'OVERDUE' ? ` · ${f.days_overdue} day${f.days_overdue === 1 ? '' : 's'}` : ''}
            </p>
            <p className="font-semibold text-gray-900 leading-snug">{f.next_action || f.subject}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 text-lg leading-none cursor-pointer">×</button>
        </div>
        <dl className="mt-3 space-y-1.5 text-[13px]">
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-gray-500">When</dt><dd className="text-gray-800">{longDay(f.follow_up_at)}{f.follow_up_timed ? ` · ${time(f.follow_up_at)}` : ' · any time'}{f.next_medium ? ` · ${MEDIUM_LABEL[f.next_medium]}` : ''}</dd></div>
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-gray-500">Enquiry</dt><dd className="min-w-0"><span className="font-mono text-xs font-semibold text-gray-700">{f.enquiry.ref_no}</span> <span className="text-gray-800">{f.enquiry.title}</span>{f.enquiry.customer?.name && <span className="block text-xs text-gray-500">{f.enquiry.customer.name}</span>}</dd></div>
          <div className="flex gap-2 items-center"><dt className="w-16 shrink-0 text-gray-500">Stage</dt><dd className="flex items-center gap-2">
            {stage && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ color: stage.color, backgroundColor: stage.bg }}>{stage.label}</span>}
            {temp && <span className="text-xs font-medium" style={{ color: temp.color }}>{temp.label}</span>}
          </dd></div>
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-gray-500">From</dt><dd className="text-gray-700">{MEDIUM_LABEL[f.type] || f.type} on {new Date(f.activity_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{f.next_action && f.subject ? ` — ${f.subject}` : ''}</dd></div>
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-gray-500">Added by</dt><dd className="text-gray-800">{f.created_by_name || '—'}{f.handler_name && f.handler_name !== f.created_by_name ? <span className="text-gray-500"> · with {f.handler_name} now</span> : ''}</dd></div>
          {!open && <p className="pt-1 text-xs text-green-700">✓ {followUpDoneText(f)}{f.done_entry?.outcome ? <span className="text-gray-600"> — {f.done_entry.outcome}</span> : ''}</p>}
        </dl>
        <div className="flex gap-2 mt-4">
          <Link href={`${ENQ}/${f.enquiry.id}`} className="btn-primary flex-1 justify-center py-1.5 text-sm">Open enquiry</Link>
          {open && canReschedule(f) && (
            <button type="button" onClick={() => { onClose(); onReschedule(f); }} className="btn-secondary flex-1 justify-center py-1.5 text-sm">Reschedule</button>
          )}
        </div>
      </div>
    </>
  );
}

/** A follow-up as a compact chip (all-day strip and month cells). */
function Chip({ f, onPick, showTime }) {
  const tone = TONE[f.status] || TONE.UPCOMING;
  return (
    <button type="button" onClick={(e) => onPick(f, e)} title={`${f.enquiry.ref_no} · ${f.next_action || f.subject}`}
      className={`w-full text-left truncate rounded-sm pl-1.5 pr-1 py-0.5 text-[11px] leading-4 cursor-pointer border-l-[3px] ${tone.cls} ${f.status === 'DONE' ? 'opacity-75' : ''}`}
      style={{ borderLeftColor: tone.bar }}>
      {showTime && f.follow_up_timed && <span className="font-medium">{time(f.follow_up_at)} </span>}
      <span className="font-semibold">{f.enquiry.ref_no}</span> {f.enquiry.customer?.name || f.enquiry.title}
    </button>
  );
}

/** Day / Work week / Week: the all-day strip, then the hour grid. */
function TimeGrid({ days, byDay, onPick, onDay }) {
  const scroller = useRef(null);
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  // Open on the working day (from 8 AM), as Teams does.
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 8 * HOUR_PX - 8; }, []);
  const today = ymd(now);
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;
  const ALLDAY_SHOWN = 2;
  const allDay = days.map((d) => (byDay.get(ymd(d)) || []).filter((f) => !f.follow_up_timed));
  const more = allDay.some((l) => l.length > ALLDAY_SHOWN);
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: days.length > 1 ? 720 : 0 }}>
        {/* Day headers */}
        <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: cols }}>
          <div />
          {days.map((d) => {
            const isToday = ymd(d) === today;
            return (
              <button key={ymd(d)} type="button" onClick={() => onDay(d)} title="Open this day"
                className={`text-left px-2 py-2 border-l border-gray-200 cursor-pointer hover:bg-gray-50 ${isToday ? 'border-t-2 border-t-[var(--ams-primary)]' : ''}`}>
                <span className={`block text-xl leading-6 font-semibold ${isToday ? 'text-[var(--ams-primary)]' : 'text-gray-800'}`}>{d.getDate()}</span>
                <span className={`block text-xs ${isToday ? 'text-[var(--ams-primary)] font-medium' : 'text-gray-500'}`}>{d.toLocaleDateString('en-IN', { weekday: 'long' })}</span>
              </button>
            );
          })}
        </div>
        {/* All-day strip: the follow-ups with a day but no time */}
        <div className="grid border-b border-gray-200 bg-gray-50/50" style={{ gridTemplateColumns: cols }}>
          <div className="text-[10px] text-gray-400 text-right pr-2 pt-1.5 leading-tight">All day</div>
          {allDay.map((list, i) => (
            <div key={ymd(days[i])} className="border-l border-gray-200 p-1 space-y-0.5 min-h-[30px]">
              {(expanded ? list : list.slice(0, ALLDAY_SHOWN)).map((f) => <Chip key={f.id} f={f} onPick={onPick} />)}
              {!expanded && list.length > ALLDAY_SHOWN && (
                <button type="button" onClick={() => setExpanded(true)} className="text-[11px] text-gray-500 hover:text-gray-800 px-1 cursor-pointer">+{list.length - ALLDAY_SHOWN} more</button>
              )}
            </div>
          ))}
        </div>
        {expanded && more && (
          <div className="text-right px-2 py-0.5 border-b border-gray-200"><button type="button" onClick={() => setExpanded(false)} className="text-[11px] text-gray-500 hover:text-gray-800 cursor-pointer">Show less</button></div>
        )}
        {/* Hour grid */}
        <div ref={scroller} className="relative overflow-y-auto" style={{ height: 'min(62vh, 640px)' }}>
          <div className="grid relative" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
            <div className="relative">
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="absolute right-2 text-[10px] text-gray-400 -translate-y-1/2" style={{ top: h * HOUR_PX }}>
                  {h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString('en-IN', { hour: 'numeric' })}
                </span>
              ))}
            </div>
            {days.map((d) => {
              const k = ymd(d);
              const timed = (byDay.get(k) || []).filter((f) => f.follow_up_timed);
              const lay = layoutDay(timed);
              const isToday = k === today;
              return (
                <div key={k} className={`relative border-l border-gray-200 ${isToday && days.length > 1 ? 'bg-[var(--ams-primary-light)]' : ''}`}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-gray-100" style={{ top: h * HOUR_PX }}>
                      <div className="border-t border-dashed border-gray-50" style={{ marginTop: HOUR_PX / 2 - 1 }} />
                    </div>
                  ))}
                  {timed.map((f) => {
                    const at = new Date(f.follow_up_at);
                    const top = (at.getHours() * 60 + at.getMinutes()) * HOUR_PX / 60;
                    const { col, cols: n } = lay.get(f.id);
                    const tone = TONE[f.status] || TONE.UPCOMING;
                    return (
                      <button key={f.id} type="button" onClick={(e) => onPick(f, e)}
                        title={`${time(at)} · ${f.enquiry.ref_no} · ${f.next_action || f.subject}`}
                        className={`absolute text-left overflow-hidden whitespace-nowrap text-ellipsis rounded-sm border-l-[3px] px-1.5 py-0.5 text-[11px] leading-4 cursor-pointer shadow-[0_0_0_1px_white] ${tone.cls} ${f.status === 'DONE' ? 'opacity-75' : ''}`}
                        style={{ top: top + 1, height: BLOCK_MIN * HOUR_PX / 60 - 2, left: `calc(${(col / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, borderLeftColor: tone.bar }}>
                        <span className="font-semibold">{f.enquiry.ref_no}</span>
                        <span className="ml-1 opacity-80">{time(at)}{f.next_medium ? ` · ${MEDIUM_LABEL[f.next_medium]}` : ''}</span>
                        <span className="ml-1">· {f.enquiry.customer?.name || f.enquiry.title}</span>
                        <span className="ml-1 opacity-80">— {f.next_action || f.subject}</span>
                      </button>
                    );
                  })}
                  {isToday && (
                    <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: (now.getHours() * 60 + now.getMinutes()) * HOUR_PX / 60 }}>
                      <div className="relative border-t-2 border-red-500">
                        <span className="absolute -left-1 -top-[5px] w-2 h-2 rounded-full bg-red-500" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Month: six weeks, each day with its first follow-ups and "+N more". */
function MonthGrid({ anchor, days, byDay, onPick, onDay }) {
  const today = ymd(new Date());
  const SHOWN = 3;
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7" style={{ minWidth: 720 }}>
        {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-xs font-medium text-gray-500 border-b border-gray-200">{d}</div>)}
        {days.map((d, i) => {
          const k = ymd(d);
          const list = byDay.get(k) || [];
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = k === today;
          return (
            <div key={k} className={`min-h-[112px] p-1 border-b border-gray-200 ${i % 7 ? 'border-l' : ''} ${inMonth ? '' : 'bg-gray-50/70'}`}>
              <button type="button" onClick={() => onDay(d)} title="Open this day"
                className={`mb-1 ml-0.5 inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-full text-xs cursor-pointer hover:bg-gray-100 ${isToday ? 'bg-[var(--ams-primary)] text-white font-semibold hover:bg-[var(--ams-primary-hover)]' : inMonth ? 'text-gray-700' : 'text-gray-400'}`}>
                {d.getDate() === 1 ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : d.getDate()}
              </button>
              <div className="space-y-0.5">
                {list.slice(0, SHOWN).map((f) => <Chip key={f.id} f={f} onPick={onPick} showTime />)}
                {list.length > SHOWN && (
                  <button type="button" onClick={() => onDay(d)} className="text-[11px] text-gray-600 hover:text-gray-900 font-medium px-1 cursor-pointer">+{list.length - SHOWN} more</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * @param {{ mode: string, anchor: Date, items: object[], onMode: (m: string) => void,
 *   onAnchor: (d: Date) => void, canReschedule: (f: object) => boolean, onReschedule: (f: object) => void }} props
 */
export default function FollowupCalendar({ mode, anchor, items, onMode, onAnchor, canReschedule, onReschedule }) {
  const [pick, setPick] = useState(null);
  const { days } = calendarRange(mode, anchor);
  const inView = new Set(days.map(ymd));
  const byDay = new Map();
  for (const f of items) {
    const k = ymd(new Date(f.follow_up_at));
    if (!inView.has(k)) continue;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(f);
  }
  for (const list of byDay.values()) list.sort((a, b) => new Date(a.follow_up_at) - new Date(b.follow_up_at));
  const onPick = (f, e) => setPick({ f, x: e.clientX, y: e.clientY });
  const openDay = (d) => { onMode('day'); onAnchor(startOfDay(d)); };
  const shown = [...byDay.values()].reduce((n, l) => n + l.length, 0);

  return (
    <div>
      {/* Toolbar: Today, ‹ ›, the range, the view */}
      <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-gray-200">
        <button type="button" onClick={() => onAnchor(startOfDay(new Date()))} className="btn-secondary px-3 py-1 text-sm">Today</button>
        <div className="flex">
          <button type="button" onClick={() => onAnchor(stepAnchor(mode, anchor, -1))} aria-label="Previous" className="w-8 h-8 rounded-full text-lg text-gray-600 hover:bg-gray-100 cursor-pointer">‹</button>
          <button type="button" onClick={() => onAnchor(stepAnchor(mode, anchor, 1))} aria-label="Next" className="w-8 h-8 rounded-full text-lg text-gray-600 hover:bg-gray-100 cursor-pointer">›</button>
        </div>
        <h2 className="text-base font-semibold text-gray-800">{rangeTitle(mode, anchor, days)}</h2>
        <span className="text-xs text-gray-500">{shown ? `${shown} follow-up${shown === 1 ? '' : 's'}` : 'No follow-ups'}</span>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-3 text-[11px] text-gray-500 mr-2">
          {Object.entries(STATUS_LABEL).map(([k, l]) => (
            <span key={k} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TONE[k].bar }} />{l}</span>
          ))}
        </div>
        <div className="flex rounded border border-gray-300 overflow-hidden text-sm" role="group" aria-label="Calendar view">
          {MODES.map((m) => (
            <button key={m.key} type="button" onClick={() => onMode(m.key)} aria-pressed={mode === m.key}
              className={`px-3 py-1 cursor-pointer ${mode === m.key ? 'bg-[var(--ams-primary-mid)] text-[var(--ams-primary)] font-medium' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{m.label}</button>
          ))}
        </div>
      </div>

      {mode === 'month'
        ? <MonthGrid anchor={anchor} days={days} byDay={byDay} onPick={onPick} onDay={openDay} />
        : <TimeGrid key={mode} days={days} byDay={byDay} onPick={onPick} onDay={openDay} />}

      {pick && <FollowupCard pick={pick} canReschedule={canReschedule} onReschedule={onReschedule} onClose={() => setPick(null)} />}
    </div>
  );
}
