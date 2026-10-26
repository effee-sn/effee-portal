'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, tokenExpiry, isExpired, endSession } from './session';

/**
 * Keeps a page for signed-in users: without a token it goes to the login
 * page; with one, the session ends by itself the moment the token expires —
 * also when the tab was asleep or in the background, checked again on return.
 */
export default function useAuth() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return undefined;
    }
    if (isExpired(token)) {
      endSession('expired');
      return undefined;
    }

    // Sign out at the expiry time (timers longer than ~24.8 days overflow, so cap and re-check).
    const exp = tokenExpiry(token);
    const timer = exp ? setTimeout(() => { if (isExpired()) endSession('expired'); }, Math.min(exp - Date.now() + 1000, 2_000_000_000)) : null;
    // A sleeping laptop or a background tab can miss the timer: check again on return.
    const recheck = () => { if (document.visibilityState === 'visible' && isExpired()) endSession('expired'); };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [router]);
}
