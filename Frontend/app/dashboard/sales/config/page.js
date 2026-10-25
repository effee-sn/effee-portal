'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Sales configuration moved to Administrator → Configuration → Sales. */
export default function SalesConfigRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/configuration?section=sales'); }, [router]);
  return <p className="p-6 text-sm text-gray-500">Sales configuration has moved to Administrator → Configuration…</p>;
}
