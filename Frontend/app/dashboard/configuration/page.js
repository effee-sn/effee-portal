'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { SkeletonLine } from '@/components/Skeleton';
import SalesConfig from '@/components/config/SalesConfig';
import MaterialCodesConfig from '@/components/config/MaterialCodesConfig';
import UnitsConfig from '@/components/config/UnitsConfig';
import RevisionsConfig from '@/components/config/RevisionsConfig';
import MachineIdsConfig from '@/components/config/MachineIdsConfig';

/**
 * Administrator → Configuration: every module's settings in one place.
 *
 * A sidebar lists the sections this person may open (each gated by its own
 * module's config permission); the open section is kept in the address
 * (?section=…) so links and refreshes land on it. A new module's settings are
 * one entry in SECTIONS.
 */
const SECTIONS = [
  {
    key: 'sales', label: 'Sales', perm: 'SALES_CONFIG_VIEW',
    hint: 'Stage probability, applications and reminders',
    render: (has) => <SalesConfig has={has} />,
  },
  {
    key: 'material-codes', label: 'Material Codes', perm: 'MATERIAL_CONFIG_VIEW',
    hint: 'IMM code prefixes and numbering',
    render: (has) => <MaterialCodesConfig has={has} />,
  },
  {
    key: 'units', label: 'Units of Measure', perm: 'MATERIAL_CONFIG_VIEW',
    hint: 'What material quantities are counted in',
    render: (has) => <UnitsConfig has={has} />,
  },
  {
    key: 'revisions', label: 'Revisions', perm: 'MATERIAL_CONFIG_VIEW',
    hint: 'How drawing revisions are labelled',
    render: (has) => <RevisionsConfig has={has} />,
  },
  {
    key: 'machine-ids', label: 'Machine IDs', perm: 'PROJECT_CONFIG_VIEW',
    hint: 'How project machines are numbered',
    render: (has) => <MachineIdsConfig has={has} />,
  },
];

function ConfigurationInner() {
  useAuth();
  const { me, can, loading } = usePermissions();
  const router = useRouter();
  const params = useSearchParams();
  const has = (code) => me?.is_system || can(code);

  const visible = useMemo(() => SECTIONS.filter((s) => me?.is_system || can(s.perm)), [me, can]);
  const requested = params.get('section');
  const current = visible.find((s) => s.key === requested) ?? visible[0];

  if (loading) {
    return (
      <div className="p-4 flex gap-4">
        <SkeletonLine className="h-64 w-56" /><SkeletonLine className="h-96 flex-1" />
      </div>
    );
  }
  if (!visible.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view any configuration.</p>
      </div>
    );
  }

  const open = (key) => router.replace(`/dashboard/configuration?section=${key}`, { scroll: false });

  return (
    <div className="p-4 pb-10 flex flex-wrap gap-4 items-start">
      <nav aria-label="Configuration sections"
        className="flex-[1_1_220px] max-w-full lg:max-w-[240px] bg-white rounded-lg border border-gray-200 overflow-hidden">
        <p className="px-4 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Configuration</p>
        <ul className="pb-2">
          {visible.map((s) => {
            const active = s.key === current.key;
            return (
              <li key={s.key}>
                <button type="button" onClick={() => open(s.key)} aria-current={active ? 'page' : undefined}
                  className={`w-full text-left px-4 py-2.5 border-l-2 cursor-pointer transition ${active
                    ? 'border-[var(--ams-primary)] bg-[var(--ams-primary-light)]'
                    : 'border-transparent hover:bg-gray-50'}`}>
                  <span className={`block text-sm ${active ? 'font-semibold text-[var(--ams-primary)]' : 'text-gray-700'}`}>{s.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{s.hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="flex-[999_1_560px] min-w-0" aria-label={current.label}>
        <header className="mb-3">
          <h1 className="text-xl font-semibold text-gray-900">{current.label}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{current.hint}</p>
        </header>
        {current.render(has)}
      </section>
    </div>
  );
}

export default function ConfigurationPage() {
  return (
    <Suspense fallback={<div className="p-4"><SkeletonLine className="h-96" /></div>}>
      <ConfigurationInner />
    </Suspense>
  );
}
