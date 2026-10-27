/**
 * The right-hand summary of a master-data detail page (a material, a
 * subassembly): small cards of label / value rows that stay visible on every tab.
 */

/** A titled card, with an optional link-style action on the right of its title. */
export function SideCard({ title, action, children }) {
  return (
    <section className="bg-white rounded border border-gray-200">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      <dl className="px-4 py-3 space-y-2.5">{children}</dl>
    </section>
  );
}

/** One label / value row of a SideCard. */
export function SideRow({ name, children, mono = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-gray-500 shrink-0">{name}</dt>
      <dd className={`text-sm text-gray-800 text-right break-words min-w-0 ${mono ? 'font-mono' : ''}`}>{children || <span className="text-gray-400">—</span>}</dd>
    </div>
  );
}

/** The header's strip of key facts: [label, value, mono?] pairs. */
export function KeyFacts({ items }) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2 mt-3">
      {items.map(([k, v, mono]) => (
        <div key={k}>
          <dt className="text-[11px] uppercase tracking-wide text-gray-500">{k}</dt>
          <dd className={`text-sm font-medium text-gray-800 ${mono ? 'font-mono' : ''}`}>{v || <span className="text-gray-400 font-normal">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A tab bar (wraps instead of scrolling). @param {{ tabs: Array<{ key: string, label: string }>, active: string, onPick: (key: string) => void }} props */
export function TabBar({ tabs, active, onPick }) {
  return (
    <div className="flex flex-wrap gap-1 px-5 border-b border-gray-200" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={active === t.key} onClick={() => onPick(t.key)}
          className={`px-3 py-2.5 text-sm -mb-px border-b-2 whitespace-nowrap cursor-pointer ${active === t.key ? 'border-[var(--ams-primary)] text-gray-800 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
