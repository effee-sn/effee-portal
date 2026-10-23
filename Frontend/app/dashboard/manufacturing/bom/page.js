'use client';

import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { TableSkeleton } from '@/components/Skeleton';

/**
 * Manufacturing → Bill of Materials.
 *
 * The page shell: the list, the screens and how BOMs work are being defined
 * next. Gated by BOM_VIEW; creating and changing BOMs will use BOM_CREATE /
 * BOM_EDIT / BOM_DELETE.
 */
export default function BomPage() {
  useAuth();
  const { me, can, loading } = usePermissions();
  const has = (code) => me?.is_system || can(code);

  if (loading) {
    return (
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        <div className="h-12 border-b border-gray-200 animate-pulse bg-gray-50" />
        <TableSkeleton cols={5} rows={4} />
      </div>
    );
  }

  if (!has('BOM_VIEW')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view bills of materials.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 flex-wrap">
        <span className="text-sm font-medium text-gray-700 shrink-0 px-1">Bill of Materials</span>
        <span className="text-xs text-gray-400">Manufacturing</span>
      </div>
      <div className="flex flex-col items-center justify-center text-center px-6 py-16">
        <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7l8-4 8 4-8 4-8-4zm0 5l8 4 8-4M4 17l8 4 8-4" />
        </svg>
        <p className="text-sm font-semibold text-gray-700">No bills of materials yet</p>
        <p className="text-sm text-gray-500 mt-1 max-w-md">This is where products and their components will be managed.</p>
      </div>
    </div>
  );
}
