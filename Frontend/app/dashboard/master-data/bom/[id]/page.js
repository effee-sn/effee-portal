'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Master Data → BOM is now Master Data → Subassemblies: same subassembly, new address. */
export default function BomItemRedirect() {
  const router = useRouter();
  const { id } = useParams();
  useEffect(() => { router.replace(`/dashboard/master-data/subassemblies/${id}`); }, [router, id]);
  return <p className="p-6 text-sm text-gray-500">BOM is now Master Data → Subassemblies…</p>;
}
