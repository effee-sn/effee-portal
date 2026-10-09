import Link from 'next/link';
import { STAGE_STYLE } from '@/lib/salesOptions';

/**
 * Shared building blocks for the dashboards (home and Sales → Dashboard), so
 * both read as one product: same cards, figures, chips and skeletons.
 */

/** Indian compact currency for tiles: ₹4.5 Cr, ₹12.3 L, ₹85 K. */
export function compactINR(value) {
  const n = Number(value) || 0;
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)} K`;
  return `₹${Math.round(n)}`;
}

/** A headline figure in a module snapshot. */
export function Stat({ label, value, sub, title, tone }) {
  return (
    <div className="bg-white px-4 py-3.5 min-w-0" title={title}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums mt-1 leading-tight ${tone === 'warning' ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

export function Card({ title, action, children, className = '', id }) {
  return (
    <section id={id} className={`bg-white rounded-lg border border-gray-200 scroll-mt-4 ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const CardLink = ({ href, children }) => (
  <Link href={href} className="text-xs font-medium text-[var(--ams-primary)] hover:underline whitespace-nowrap">{children}</Link>
);

export function StageChip({ stage }) {
  const s = STAGE_STYLE[stage];
  if (!s) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
      style={{ color: s.color, backgroundColor: s.bg }}>{s.label}</span>
  );
}

export function Empty({ children }) {
  return <p className="px-4 py-8 text-center text-sm text-gray-400">{children}</p>;
}

/** Skeleton placeholder block. */
export function Pulse({ className }) {
  return <div className={`bg-gray-200 rounded-md animate-pulse ${className}`} />;
}
