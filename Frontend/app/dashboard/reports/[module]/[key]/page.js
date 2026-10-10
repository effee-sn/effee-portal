'use client';

import { useParams } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import ReportViewer from '@/components/ReportViewer';
import { TableSkeleton } from '@/components/Skeleton';

/** One MIS report: `/dashboard/reports/:module/:key`. */
export default function ReportPage() {
  useAuth();
  const { module, key } = useParams();
  const { me, can, loading } = usePermissions();

  if (loading) return <div className="p-4"><TableSkeleton cols={6} rows={8} /></div>;

  if (!(me?.is_system || can('REPORT_VIEW'))) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view reports.</p>
      </div>
    );
  }

  return <ReportViewer module={module} reportKey={key} canExport={me?.is_system || can('REPORT_EXPORT')} />;
}
