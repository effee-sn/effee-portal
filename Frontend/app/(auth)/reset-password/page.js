'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
import useNav from '@/lib/useNav';

/** Why a link can't be used, worded for an invite or a reset. */
function DeadLink({ reason, isInvite }) {
  const copy = {
    used: isInvite
      ? ['This link has already been used', 'Your password is already set. Sign in with it — or use “Forgot password” if you don’t remember it.']
      : ['This link has already been used', 'Your password was changed with this link. Sign in, or request a new link if you need to reset it again.'],
    expired: isInvite
      ? ['This link has expired', 'Ask your administrator to resend the invite, or request a new link below.']
      : ['This link has expired', 'Reset links are valid for 1 hour. Request a new one below.'],
    invalid: ['This link isn’t valid', 'It may be incomplete or replaced by a newer link. Request a new one below.'],
  }[reason] || ['This link can’t be used', 'Request a new one below.'];

  return (
    <div className="text-center space-y-4 py-2">
      <div className="w-14 h-14 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center mx-auto">
        <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700">{copy[0]}</p>
        <p className="text-xs text-gray-500 mt-1">{copy[1]}</p>
      </div>
      <div className="flex gap-2 justify-center">
        <Link href="/login" className="btn-primary inline-flex justify-center">Sign in</Link>
        <Link href="/forgot-password" className="btn-secondary inline-flex justify-center">Request a new link</Link>
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const nav       = useNav();
  const token        = searchParams.get('token');
  // A new user's welcome link (vs a forgotten-password link) — same flow, own wording.
  const isInvite     = searchParams.get('invite') === '1';

  const [passwords, setPasswords] = useState({ new_password: '', confirm_password: '' });
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);
  // null = checking; then 'valid' | 'used' | 'expired' | 'invalid'.
  const [linkStatus, setLinkStatus] = useState(null);

  // Check the link as soon as the page opens, so a used or expired link says
  // so straight away instead of showing a form that can only fail.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/reset-password/status?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!cancelled) setLinkStatus(res.ok ? (data.valid ? 'valid' : data.reason || 'invalid') : 'valid');
      } catch {
        // Can't check (network): show the form; the submit still validates.
        if (!cancelled) setLinkStatus('valid');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (!token) {
    return (
      <div className="text-center space-y-4 py-2">
        <div className="w-14 h-14 bg-red-50 border border-red-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">Invalid reset link</p>
          <p className="text-xs text-gray-400 mt-1">This link is missing a token. Please request a new one.</p>
        </div>
        <Link href="/forgot-password" className="btn-primary inline-flex justify-center">
          Request New Link
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (passwords.new_password.length < 6) return setError('Password must be at least 6 characters');
    if (passwords.new_password !== passwords.confirm_password) return setError('Passwords do not match');
    setLoading(true); setError('');
    try {
      const res  = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: passwords.new_password }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Used or expired in the meantime (e.g. in another tab): show the explanation.
        if (/already been used/i.test(data.message || '')) { setLinkStatus('used'); return; }
        if (/invalid or has expired/i.test(data.message || '')) { setLinkStatus('expired'); return; }
        throw new Error(data.message || 'Something went wrong');
      }
      setDone(true);
      setTimeout(() => nav('/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center space-y-4 py-2">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
          style={{ backgroundColor: 'var(--ams-primary-mid)' }}>
          <svg className="w-7 h-7" style={{ color: 'var(--ams-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">{isInvite ? 'Your password is set — welcome!' : 'Password reset successfully!'}</p>
          <p className="text-xs text-gray-400 mt-1">Redirecting you to login…</p>
        </div>
      </div>
    );
  }

  if (linkStatus === null) {
    return <p className="text-center text-sm text-gray-400 py-6">Checking your link…</p>;
  }
  if (linkStatus !== 'valid') return <DeadLink reason={linkStatus} isInvite={isInvite} />;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}
      {[
        { key: 'new_password',     label: 'New Password',     placeholder: 'Min. 6 characters' },
        { key: 'confirm_password', label: 'Confirm Password', placeholder: 'Repeat new password' },
      ].map((f) => (
        <div key={f.key}>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            {f.label}<span className="text-red-500"> *</span>
          </label>
          <input
            type="password"
            value={passwords[f.key]}
            onChange={(e) => { setPasswords({ ...passwords, [f.key]: e.target.value }); setError(''); }}
            placeholder={f.placeholder}
            autoFocus={f.key === 'new_password'}
            className="ams-input"
          />
        </div>
      ))}
      <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-1">
        {loading ? 'Saving…' : isInvite ? 'Set Password' : 'Reset Password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--ams-bg)' }}>
      <div className="w-full max-w-sm">

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>

          {/* Brand strip */}
          <div className="px-8 pt-8 pb-6 text-center border-b border-gray-100">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 text-white text-xl font-black"
              style={{ backgroundColor: 'var(--ams-primary)' }}>
              E
            </div>
            <h1 className="text-xl font-bold text-gray-800">Set New Password</h1>
            <p className="text-xs text-gray-400 mt-0.5">Choose a strong password for your account</p>
          </div>

          <div className="px-8 py-6">
            <Suspense fallback={<div className="text-center text-sm text-gray-400 py-4">Loading…</div>}>
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--ams-primary)' }}>
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
