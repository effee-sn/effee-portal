'use client';

import { useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/config';

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError('Please enter your email address');
    setLoading(true); setError('');
    try {
      const res  = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Something went wrong');
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
            <h1 className="text-xl font-bold text-gray-800">
              {sent ? 'Check your inbox' : 'Forgot Password'}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {sent
                ? `A reset link was sent to ${email}`
                : "Enter your email and we'll send a reset link"}
            </p>
          </div>

          {/* Content */}
          <div className="px-8 py-6">
            {sent ? (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                  style={{ backgroundColor: 'var(--ams-primary-mid)' }}>
                  <svg className="w-7 h-7" style={{ color: 'var(--ams-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-600">
                  If that email is registered you&apos;ll receive a reset link shortly. Check your spam folder if it doesn&apos;t arrive.
                </p>
                <button
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="text-sm font-medium hover:underline"
                  style={{ color: 'var(--ams-primary)' }}
                >
                  Try a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">
                    {error}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="you@company.com"
                    autoFocus
                    className="ams-input"
                  />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-1">
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Remember your password?{' '}
          <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--ams-primary)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
