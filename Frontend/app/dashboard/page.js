'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function Pulse({ className }) {
  return <div className={`bg-gray-200 rounded-lg animate-pulse ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Pulse className="h-7 w-48" />
        <Pulse className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
            <Pulse className="h-5 w-32" />
            <Pulse className="h-8 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, href }) {
  const inner = (
    <div className="bg-white rounded-lg border border-gray-200 p-5 flex items-center gap-4 hover:shadow-sm transition-shadow">
      <div className={`${color} rounded-lg p-3 shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide leading-none mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const QUICK_LINKS = [
  { label: 'Manage Users', href: '/dashboard/users',    icon: '👥', color: 'text-violet-600', bg: 'bg-violet-50', system: true },
  { label: 'Settings',     href: '/dashboard/settings', icon: '⚙️', color: 'text-gray-600',   bg: 'bg-gray-50',   system: false },
];

function QuickLinks({ isSystem }) {
  const links = QUICK_LINKS.filter((l) => !l.system || isSystem);
  if (!links.length) return null;
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Links</h2>
      <div className="space-y-1">
        {links.map((l) => (
          <Link key={l.href} href={l.href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition group">
            <span className={`w-8 h-8 rounded-lg ${l.bg} flex items-center justify-center text-base shrink-0`}>
              {l.icon}
            </span>
            <span className={`text-sm font-medium ${l.color}`}>{l.label}</span>
            <svg className="w-4 h-4 text-gray-300 ml-auto group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  useAuth();
  const { me, can, loading: permLoading } = usePermissions();

  const [data, setData]       = useState(null);
  const [svc, setSvc]         = useState(null);
  const [loading, setLoading] = useState(true);

  const canService = me?.is_system || can('SERVICE_VIEW');

  useEffect(() => {
    apiGet('/dashboard')
      .then(setData)
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, []);

  // Service snapshot — only for users who can see tickets (the /service
  // aggregate is oversight-tier). Loads independently of the main payload.
  useEffect(() => {
    if (permLoading || !canService) return;
    apiGet('/service').then((res) => setSvc(res.data)).catch(() => {});
  }, [permLoading, canService]);

  if (loading) return <DashboardSkeleton />;

  const { user, orgStats } = data;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 p-4 pb-8">

      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {greeting()}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-1.5">
            <span className="inline-flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${user?.is_system ? 'bg-orange-400' : 'bg-[#875A7B]'}`} />
              {user?.role}
            </span>
          </p>
        </div>
        <p className="text-xs text-gray-400 hidden sm:block">{today}</p>
      </div>

      {/* Org stats (system users only) */}
      {orgStats && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Overview</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              label="Active Users"
              value={orgStats.users}
              color="bg-[#875A7B]"
              href="/dashboard/users"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            />
            <StatCard
              label="Roles"
              value={orgStats.roles}
              color="bg-orange-500"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
            />
          </div>
        </div>
      )}

      {/* Service snapshot — for ticket oversight roles */}
      {svc && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Service Tickets</p>
            <Link href="/dashboard/service" className="text-xs font-medium text-[#875A7B] hover:underline">Service dashboard →</Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total Tickets" value={svc.total} color="bg-gray-400" href="/dashboard/service/tickets"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
            <StatCard label="Active" value={svc.active} color="bg-amber-500" href="/dashboard/service/inbox"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
            <StatCard label="On Observation" value={svc.on_observation} color="bg-cyan-600" href="/dashboard/service"
              icon={<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>} />
          </div>
        </div>
      )}

      {/* Quick links */}
      <QuickLinks isSystem={!!user?.is_system} />

    </div>
  );
}
