'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The Flow Builder has been retired. Ticket routing is handled by the parallel
 * department-task model, so the workflow is a fixed backbone (triage → customer
 * confirmation) that must not be edited — the seeded flow stays intact and is
 * managed in code, not through a UI. Anyone landing here is sent to the
 * dashboard.
 */
export default function FlowBuilderRetired() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return null;
}
