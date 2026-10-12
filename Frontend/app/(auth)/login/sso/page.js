'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useNav from '@/lib/useNav';

/**
 * Where the backend sends the browser after Microsoft sign-in. The session
 * token (or an error message) arrives in the URL fragment — never sent to any
 * server, so it stays out of logs. A token is stored like a password sign-in
 * and the user goes to the dashboard; an error is shown with a way back.
 */
export default function SsoReturnPage() {
  const nav = useNav();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Drop the fragment from the address bar and history right away.
    window.history.replaceState(null, '', window.location.pathname);

    const token = params.get('token');
    if (token) {
      localStorage.setItem('token', token);
      nav.replace('/dashboard');
      return;
    }
    const message = params.get('error') || 'Microsoft sign-in did not complete. Please try again.';
    // Deferred so the state update isn't synchronous inside the effect.
    Promise.resolve().then(() => setError(message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--ams-bg)' }}>
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 px-8 py-8 text-center"
        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        {error ? (
          <>
            <h1 className="text-lg font-bold text-gray-800">Couldn&apos;t sign you in</h1>
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-4 text-left">{error}</p>
            <Link href="/login" className="btn-primary inline-flex justify-center w-full py-2.5 mt-5">Back to sign in</Link>
          </>
        ) : (
          <>
            <div className="mx-auto w-8 h-8 rounded-full border-2 border-gray-200 border-t-[var(--ams-primary)] animate-spin" aria-hidden="true" />
            <p className="text-sm text-gray-600 mt-4">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}
