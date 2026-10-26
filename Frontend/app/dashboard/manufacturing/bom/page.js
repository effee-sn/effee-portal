'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** BOM moved from Manufacturing to Master Data, and is now Subassemblies. */
export default function BomRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/master-data/subassemblies'); }, [router]);
  return <p className="p-6 text-sm text-gray-500">This has moved to Master Data → Subassemblies…</p>;
}
