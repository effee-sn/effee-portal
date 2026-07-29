'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/config';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get('token');

  const [passwords, setPasswords] = useState({ new_password: '', confirm_password: '' });
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);

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
      if (!res.ok) throw new Error(data.message || 'Something went wrong');
      setDone(true);
      setTimeout(() => router.push('/login'), 3000);
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
          <p className="text-sm font-semibold text-gray-700">Password reset successfully!</p>
          <p className="text-xs text-gray-400 mt-1">Redirecting you to login…</p>
        </div>
      </div>
    );
  }

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
            {f.label}
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
        {loading ? 'Resetting…' : 'Reset Password'}
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
              A
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
