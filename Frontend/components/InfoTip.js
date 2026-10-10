'use client';

/**
 * A small ⓘ that shows help text on hover — and on keyboard focus, so it works
 * without a mouse. `children` is the tooltip content.
 *
 * @param {{ label: string, children: import('react').ReactNode, className?: string }} props
 *   `label` is the accessible name, e.g. "About Review".
 */
export default function InfoTip({ label, children, className = '' }) {
  return (
    <span className={`relative inline-flex group ${className}`}>
      <button type="button" aria-label={label}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold leading-none text-gray-500 border border-gray-300 hover:text-gray-800 hover:border-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ams-primary)] cursor-help">
        i
      </button>
      <span role="tooltip"
        className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-0 top-full mt-1.5 z-30 w-72 max-w-[80vw] rounded-md bg-gray-900 text-white text-xs leading-relaxed px-3 py-2 shadow-lg">
        {children}
      </span>
    </span>
  );
}
