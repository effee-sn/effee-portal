'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Master Data → BOM is now Master Data → Subassemblies. */
export default function BomRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/master-data/subassemblies'); }, [router]);
  return <p className="p-6 text-sm text-gray-500">BOM is now Master Data → Subassemblies…</p>;
}
