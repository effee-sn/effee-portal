'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';
import { CardSkeleton } from '@/components/Skeleton';

/**
 * Reports (MIS) home: the report sets this user can open, grouped by module.
 * The list comes from the server, already filtered by permission.
 */
export default function ReportsPage() {
  useAuth();
  const { me, can, loading } = usePermissions();
  const canView = me?.is_system || can('REPORT_VIEW');

  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || !canView) return undefined;
    let cancelled = false;
    (async () => {
      try { const res = await apiGet('/reports'); if (!cancelled) setCatalog(res.data); }
      catch (err) { if (!cancelled) { setCatalog([]); setError(err.message); } }
    })();
    return () => { cancelled = true; };
  }, [loading, canView]);

  if (loading || (canView && !catalog)) {
    return (
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => <CardSkeleton key={i} lines={2} />)}
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pb-10">
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">MIS reports with filters, totals, Excel / CSV export and print.</p>
      </header>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

      {catalog.length === 0 && !error && (
        <p className="text-sm text-gray-500">No report sets are available for your role yet.</p>
      )}

      {catalog.map((set) => (
        <section key={set.module} aria-labelledby={`set-${set.module}`}>
          <h2 id={`set-${set.module}`} className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{set.label}</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {set.reports.map((r) => (
              <li key={r.key}>
                <Link href={`/dashboard/reports/${set.module}/${r.key}`}
                  className="block h-full bg-white rounded-lg border border-gray-200 px-4 py-3.5 hover:shadow-sm hover:border-gray-300 transition">
                  <p className="text-sm font-semibold text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
