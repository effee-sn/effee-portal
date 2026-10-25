'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** BOM moved from Manufacturing to Master Data → BOM. */
export default function BomRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/master-data/bom'); }, [router]);
  return <p className="p-6 text-sm text-gray-500">BOM has moved to Master Data → BOM…</p>;
}
