// Reusable skeleton building blocks — all use Tailwind's animate-pulse

// Single shimmering line
export function SkeletonLine({ className = '' }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

// ── Table skeleton (header + N rows) ─────────────────────────────────────────
export function TableSkeleton({ cols = 5, rows = 6 }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-5 py-3">
                  <SkeletonLine className="h-3.5 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {Array.from({ length: rows }).map((_, row) => (
              <tr key={row}>
                {Array.from({ length: cols }).map((_, col) => (
                  <td key={col} className="px-5 py-4">
                    <SkeletonLine className={`h-3.5 ${col === 0 ? 'w-32' : col === cols - 1 ? 'w-16' : 'w-24'}`} />
                    {col === 0 && <SkeletonLine className="h-3 w-20 mt-2" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stat card skeleton (dashboard) ────────────────────────────────────────────
export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-gray-200 animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLine className="h-3.5 w-24" />
        <SkeletonLine className="h-6 w-12" />
      </div>
    </div>
  );
}

// ── Card skeleton (flow cards / quick link cards) ─────────────────────────────
export function CardSkeleton({ lines = 2 }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <SkeletonLine className="h-4 w-40" />
        <SkeletonLine className="h-6 w-16 rounded-full" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} className={`h-3.5 ${i === 0 ? 'w-3/4' : 'w-1/2'}`} />
      ))}
    </div>
  );
}

// ── Two-panel skeleton (roles page) ──────────────────────────────────────────
export function TwoPanelSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-4 animate-pulse">
      {/* Left panel */}
      <div className="w-full lg:w-56 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-3 py-2.5 rounded-xl space-y-1.5">
            <SkeletonLine className="h-3.5 w-28" />
            <SkeletonLine className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Right panel */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
        {Array.from({ length: 3 }).map((_, g) => (
          <div key={g} className="space-y-3">
            <SkeletonLine className="h-4 w-36" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, p) => (
                <div key={p} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-gray-200" />
                  <SkeletonLine className="h-3 flex-1" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page header skeleton ──────────────────────────────────────────────────────
export function PageHeaderSkeleton({ hasButton = true }) {
  return (
    <div className="flex items-center justify-between mb-6 animate-pulse">
      <div className="space-y-2">
        <SkeletonLine className="h-7 w-40" />
        <SkeletonLine className="h-3.5 w-24" />
      </div>
      {hasButton && <SkeletonLine className="h-10 w-28 rounded-lg" />}
    </div>
  );
}

// ── Search bar skeleton ───────────────────────────────────────────────────────
export function SearchBarSkeleton() {
  return (
    <div className="mb-5 flex gap-3 animate-pulse">
      <SkeletonLine className="flex-1 h-10 rounded-lg" />
      <SkeletonLine className="h-10 w-20 rounded-lg" />
    </div>
  );
}
