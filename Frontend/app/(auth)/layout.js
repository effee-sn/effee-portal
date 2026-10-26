'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, isExpired } from '@/lib/session';

export default function AuthLayout({ children }) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    // An expired token is not a session: clear it and stay on the login page.
    if (isExpired(token)) {
      try { window.localStorage.removeItem('token'); } catch { /* nothing to clear */ }
      return;
    }
    router.replace('/dashboard');
  }, [router]);

  return <>{children}</>;
}
