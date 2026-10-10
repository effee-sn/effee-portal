'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';
import {
  ACTIVE_STAGES, TEMPERATURE_STYLE, formatINR, isAging, stageAgeDays,
} from '@/lib/salesOptions';
import {
  Card, CardLink, Empty, Pulse, Stat, StageChip, compactINR,
} from '@/components/DashboardKit';

/**
 * Home dashboard — role-aware. Leads with what is waiting on *this* user, then
 * module snapshots for the modules they can see. Every block comes from the
 * server already filtered by permission (see backend dashboard.service).
 */

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const dayDiff = (iso) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  return Math.round((start - d) / 86400000);
};

// ── Icons (stroke, currentColor) ─────────────────────────────────────────────
const ICON_PATHS = {
  alert:   'M12 9v3.75m0 3.75h.008M10.34 3.94 1.82 18a1.875 1.875 0 0 0 1.6 2.81h17.16a1.875 1.875 0 0 0 1.6-2.81L13.66 3.94a1.875 1.875 0 0 0-3.32 0Z',
  clock:   'M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  briefcase: 'M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1ZM10 5h4v2h-4V5Z',
  pause:   'M10 9v6m4-6v6m7-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  ticket:  'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2',
  bell:    'M14.86 17.08a23.85 23.85 0 0 0 5.45-1.31A8.97 8.97 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.97 8.97 0 0 1-2.31 6.02c1.73.64 3.56 1.08 5.45 1.31m5.72 0a24.26 24.26 0 0 1-5.72 0m5.72 0a3 3 0 1 1-5.72 0',
  folder:  'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
};
function Icon({ name, className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[name]} />
    </svg>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────
const TONES = {
  critical: { box: 'border-red-200 bg-red-50/60', icon: 'text-red-600 bg-red-100', value: 'text-red-700' },
  warning:  { box: 'border-amber-200 bg-amber-50/60', icon: 'text-amber-700 bg-amber-100', value: 'text-amber-800' },
  neutral:  { box: 'border-gray-200 bg-white', icon: 'text-[var(--ams-primary)] bg-[var(--ams-primary-mid)]', value: 'text-gray-900' },
  quiet:    { box: 'border-gray-200 bg-white', icon: 'text-gray-400 bg-gray-100', value: 'text-gray-400' },
};

/** One "needs your attention" count. Zero reads as quiet; status tones only when there's something to do. */
function AttentionTile({ label, value, icon, href, tone = 'neutral', hint }) {
  const t = TONES[value > 0 ? tone : 'quiet'];
  const body = (
    <div className={`h-full rounded-lg border px-4 py-3.5 flex items-start gap-3 transition-shadow ${t.box} ${href ? 'hover:shadow-sm' : ''}`}>
      <span className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${t.icon}`}><Icon name={icon} /></span>
      <div className="min-w-0">
        <p className={`text-2xl font-semibold leading-none tabular-nums ${t.value}`}>{value}</p>
        <p className="text-xs text-gray-600 mt-1.5 leading-snug">{label}</p>
        {hint && value > 0 && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/**
 * Open enquiries per stage, in pipeline order. Single series → one hue (brand),
 * values written beside each bar, whole row is the hover/click target.
 */
function PipelineChart({ pipeline }) {
  const rows = ACTIVE_STAGES.map((s) => {
    const hit = pipeline.find((p) => p.stage === s.value);
    return { ...s, count: hit?.count || 0, value: hit?.value || 0 };
  });
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <ul className="px-2 py-2" aria-label="Open enquiries by stage">
      {rows.map((r) => (
        <li key={r.value}>
          <Link href={`/dashboard/sales/enquiries?stage=${r.value}`}
            title={`${r.label}: ${r.count} open ${r.count === 1 ? 'enquiry' : 'enquiries'} · ${formatINR(r.value)} expected`}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 px-2 py-1.5 rounded-md hover:bg-gray-50">
            <span className={`text-xs truncate ${r.count ? 'text-gray-700' : 'text-gray-400'}`}>{r.label}</span>
            <span className="relative h-2.5 rounded-sm bg-gray-100">
              {r.count > 0 && (
                <span className="absolute inset-y-0 left-0 rounded-r-[4px]"
                  style={{ width: `${Math.max(3, (r.count / max) * 100)}%`, backgroundColor: 'var(--ams-primary)' }} />
              )}
            </span>
            <span className="text-xs tabular-nums text-right whitespace-nowrap">
              <span className={r.count ? 'font-semibold text-gray-800' : 'text-gray-400'}>{r.count}</span>
              {r.value > 0 && <span className="text-gray-500"> · {compactINR(r.value)}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-4 pb-8">
      <div className="space-y-2"><Pulse className="h-7 w-56" /><Pulse className="h-4 w-40" /></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => <Pulse key={i} className="h-[76px]" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Pulse className="h-64 lg:col-span-2" /><Pulse className="h-64" />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();

  const [data, setData]       = useState(null);
  const [svc, setSvc]         = useState(null);
  const [loading, setLoading] = useState(true);

  const canSales    = me?.is_system || can('SALES_VIEW');
  const canService  = me?.is_system || can('SERVICE_VIEW');
  const canProjects = me?.is_system || can('PROJECT_VIEW');

  useEffect(() => {
    apiGet('/dashboard')
      .then(setData)
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, []);

  // Service snapshot comes from the service module's own aggregate (oversight tier).
  useEffect(() => {
    if (permLoading || !canService) return;
    apiGet('/service').then((res) => setSvc(res.data)).catch(() => {});
  }, [permLoading, canService]);

  if (loading || permLoading) return <DashboardSkeleton />;

  const { user, myWork: w = {}, sales, projects, orgStats } = data;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const myEnquiries = w.enquiries || [];
  const followups = w.followups || [];
  const showSalesWork = canSales || w.enquiries_with_me > 0;
  const showTickets = canService || w.tickets_with_me > 0;

  return (
    <div className="space-y-6 p-4 pb-10">

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 text-balance">
            {greeting()}, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{user?.role}</p>
        </div>
        <p className="text-xs text-gray-400">{today}</p>
      </header>

      {/* Needs your attention */}
      <section aria-labelledby="attention-h">
        <h2 id="attention-h" className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Needs your attention</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {showSalesWork && (
            <>
              <AttentionTile icon="alert" tone="critical" label="Follow-ups overdue" value={w.followups_overdue ?? 0}
                href="#followups" hint="Past their date" />
              <AttentionTile icon="clock" tone="warning" label="Follow-ups due today" value={w.followups_today ?? 0}
                href="#followups" />
              <AttentionTile icon="briefcase" label="Enquiries with you" value={w.enquiries_with_me ?? 0}
                href="/dashboard/sales/enquiries" />
              <AttentionTile icon="pause" tone="warning" label="Your stalled enquiries" value={w.stalled ?? 0}
                href="#my-enquiries" hint="Past the stage's time limit" />
            </>
          )}
          {showTickets && (
            <AttentionTile icon="ticket" label="Tickets & tasks with you" value={w.tickets_with_me ?? 0}
              href="/dashboard/service/inbox" />
          )}
          <AttentionTile icon="bell" label="Unread notifications" value={w.unread_notifications ?? 0} />
        </div>
      </section>

      {/* Your work */}
      {showSalesWork && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <Card title="Your enquiries" className="lg:col-span-2" action={<CardLink href="/dashboard/sales/enquiries">All enquiries →</CardLink>}>
            <div id="my-enquiries" className="scroll-mt-4" />
            {myEnquiries.length === 0 ? (
              <Empty>No enquiries are waiting on you.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                {myEnquiries.map((e) => {
                  const days = stageAgeDays(e.stage_since);
                  const stalled = isAging(e.stage, e.stage_since);
                  const temp = TEMPERATURE_STYLE[e.current_temperature];
                  return (
                    <li key={e.id}>
                      <Link href={`/dashboard/sales/enquiries/${e.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900 truncate">
                            <span className="font-mono text-xs text-gray-500 mr-2">{e.ref_no}</span>{e.title}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{e.customer?.name}</p>
                        </div>
                        {temp && (
                          <span className="hidden sm:inline text-[11px] font-medium px-1.5 py-0.5 rounded"
                            style={{ color: temp.color, backgroundColor: temp.bg }}>{temp.label}</span>
                        )}
                        <StageChip stage={e.stage} />
                        <span className={`w-20 text-right text-xs tabular-nums whitespace-nowrap ${stalled ? 'text-amber-700 font-medium' : 'text-gray-500'}`}
                          title={stalled ? 'Past the time limit for this stage' : 'Days in this stage'}>
                          {stalled && <span aria-hidden="true">● </span>}{days}d{stalled ? ' stalled' : ''}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Follow-ups due">
            <div id="followups" className="scroll-mt-4" />
            {followups.length === 0 ? (
              <Empty>Nothing due — you&apos;re all caught up.</Empty>
            ) : (
              <ul className="divide-y divide-gray-100">
                {followups.map((f) => {
                  const late = dayDiff(f.follow_up_at);
                  return (
                    <li key={f.id}>
                      <Link href={`/dashboard/sales/enquiries/${f.enquiry.id}`} className="block px-4 py-2.5 hover:bg-gray-50">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-semibold whitespace-nowrap ${late > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                            {late > 0 ? `Overdue ${late}d` : 'Today'}
                          </span>
                          <span className="text-[11px] text-gray-500">{f.is_review ? 'Review' : 'Follow-up'}</span>
                        </div>
                        <p className="text-sm text-gray-900 truncate mt-0.5">{f.subject}</p>
                        <p className="text-xs text-gray-500 truncate">
                          <span className="font-mono">{f.enquiry.ref_no}</span> · {f.enquiry.title}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Sales snapshot */}
      {sales && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <Card title={<>Sales overview <span className="font-normal text-gray-400" title="Other currencies converted at their rates (Master Data → Currencies)">· in ₹</span></>} className="lg:col-span-1" action={<CardLink href="/dashboard/sales">Sales dashboard →</CardLink>}>
            <div className="grid grid-cols-2 gap-px bg-gray-100 rounded-b-lg overflow-hidden">
              <Stat label="Open pipeline" value={compactINR(sales.open_value)} title={formatINR(sales.open_value)}
                sub={`${sales.open_count} open ${sales.open_count === 1 ? 'enquiry' : 'enquiries'}`} />
              <Stat label="Won this month" value={compactINR(sales.won_this_month.value)} title={formatINR(sales.won_this_month.value)}
                sub={`${sales.won_this_month.count} ${sales.won_this_month.count === 1 ? 'order' : 'orders'}`} />
              <Stat label="Win rate · 90 days" value={sales.win_rate_90d === null ? '—' : `${sales.win_rate_90d}%`}
                sub={sales.decided_90d ? `of ${sales.decided_90d} closed` : 'No deals closed yet'} />
              <Stat label="Lost this month" value={sales.lost_this_month} />
              <Stat label="Hot deals" value={sales.hot} sub="Temperature: Hot" />
              <Stat label="Stalled" value={sales.stalled} tone={sales.stalled > 0 ? 'warning' : undefined}
                sub="Past the stage's time limit" />
            </div>
          </Card>

          <Card title="Pipeline by stage" className="lg:col-span-2"
            action={<span className="text-xs text-gray-500">Open enquiries · expected value</span>}>
            {sales.open_count === 0 ? <Empty>No open enquiries yet.</Empty> : <PipelineChart pipeline={sales.pipeline} />}
          </Card>
        </div>
      )}

      {/* Service + projects */}
      {(svc || projects) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {svc && (
            <Card title="Service tickets" action={<CardLink href="/dashboard/service">Service dashboard →</CardLink>}>
              <div className="grid grid-cols-3 divide-x divide-gray-100 rounded-b-lg overflow-hidden">
                <Stat label="Total" value={svc.total ?? 0} />
                <Stat label="Active" value={svc.active ?? 0} />
                <Stat label="On observation" value={svc.on_observation ?? 0} />
              </div>
            </Card>
          )}
          {projects && (
            <Card title="Projects" action={<CardLink href="/dashboard/projects">All projects →</CardLink>}>
              <div className="grid grid-cols-4 divide-x divide-gray-100 rounded-b-lg overflow-hidden">
                <Stat label="Planning" value={projects.PLANNING ?? 0} />
                <Stat label="Active" value={projects.ACTIVE ?? 0} />
                <Stat label="On hold" value={projects.ON_HOLD ?? 0} />
                <Stat label="Completed" value={projects.COMPLETED ?? 0} />
              </div>
              {w.active_projects > 0 && (
                <p className="px-4 pb-3 -mt-1 text-xs text-gray-500">{w.active_projects} of the open ones are yours.</p>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Administration */}
      {orgStats && (
        <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          <span className="font-semibold uppercase tracking-wider text-gray-400">Administration</span>
          <span><span className="tabular-nums text-gray-700">{orgStats.users}</span> active users</span>
          <span><span className="tabular-nums text-gray-700">{orgStats.roles}</span> roles</span>
          <Link href="/dashboard/users" className="text-[var(--ams-primary)] hover:underline">Manage users →</Link>
        </p>
      )}
    </div>
  );
}
