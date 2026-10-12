'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { API_URL } from '@/lib/config';
import useNav from '@/lib/useNav';

/** The Microsoft logo (four squares), as Microsoft's sign-in button guidance shows it. */
function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function LoginForm() {
  const nav = useNav();
  // What sign-in methods to offer (Administrator → Settings → Security).
  const [sso, setSso] = useState({ microsoft: false, password_login: 'all' });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet('/auth/sso/config', { silent: true })
      .then((res) => { if (!cancelled && res?.data) setSso(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Password sign-in is admin-only when SSO is on and passwords are switched
  // off for users — keep the form one click away for the Super Admin.
  const passwordHidden = sso.microsoft && sso.password_login === 'admin_only' && !showPassword;

  const [form, setForm]       = useState({ email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiPost('/auth/login', form);
      localStorage.setItem('token', data.token);
      nav('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const microsoftButton = sso.microsoft && (
    <a href={`${API_URL}/auth/sso/microsoft/start`}
      className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-md bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 transition">
      <MicrosoftLogo />
      Sign in with Microsoft
    </a>
  );

  if (passwordHidden) {
    return (
      <div className="space-y-4">
        {microsoftButton}
        <p className="text-xs text-gray-500 text-center">Use your Microsoft 365 work account.</p>
        <button type="button" onClick={() => setShowPassword(true)}
          className="block mx-auto text-xs text-gray-400 hover:text-gray-700 hover:underline cursor-pointer">
          Administrator sign-in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
    {microsoftButton && (
      <>
        {microsoftButton}
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-gray-400">
          <span className="flex-1 h-px bg-gray-200" />or<span className="flex-1 h-px bg-gray-200" />
        </div>
      </>
    )}
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email<span className="text-red-500"> *</span></label>
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="you@company.com"
          required
          autoFocus
          className="ams-input"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Password<span className="text-red-500"> *</span></label>
          <Link href="/forgot-password" className="text-xs font-medium hover:underline" style={{ color: 'var(--ams-primary)' }}>
            Forgot password?
          </Link>
        </div>
        <input
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder="••••••••"
          required
          className="ams-input"
        />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-1">
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
    </div>
  );
}

export default function LoginPage() {
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
            <h1 className="text-xl font-bold text-gray-800">Welcome back</h1>
            <p className="text-xs text-gray-400 mt-0.5">Sign in to your Effee Portal account</p>
          </div>

          <div className="px-8 py-6">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>

      </div>
    </div>
  );
}
