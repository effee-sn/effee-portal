'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/api';
import { SkeletonLine } from '@/components/Skeleton';

/**
 * Administrator → Settings → Security: Microsoft sign-in (SSO).
 *
 * The tenant / client credentials live in the backend .env (MS_SSO_*); this
 * card shows whether they're present and holds the switches: SSO on/off,
 * password sign-in for users, and auto-creating portal users on first sign-in.
 */

function Toggle({ checked, onChange, disabled, label, hint }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-1" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

const Row = ({ k, v, mono }) => (
  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
    <span className="text-gray-500">{k}</span>
    <span className={`text-gray-800 break-all ${mono ? 'font-mono text-xs pt-0.5' : ''}`}>{v || <span className="text-gray-400">—</span>}</span>
  </div>
);

export default function SsoSettings() {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(null);
  const [roles, setRoles] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet('/settings/sso');
        if (cancelled) return;
        setStatus(res.data);
        setForm({
          enabled: res.data.enabled, password_login: res.data.password_login,
          auto_create: res.data.auto_create, default_role_id: res.data.default_role_id ? String(res.data.default_role_id) : '',
        });
      } catch (err) { if (!cancelled) setMsg({ type: 'error', text: err.message }); }
    })();
    apiGet('/lookup/roles').then((r) => { if (!cancelled) setRoles(Array.isArray(r) ? r : r?.data || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      const res = await apiPut('/settings/sso', { ...form, default_role_id: form.default_role_id || null });
      setStatus(res.data);
      setMsg({ type: 'success', text: res.data.active ? 'Saved. Microsoft sign-in is live on the login page.' : 'Saved.' });
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setSaving(false); }
  };

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setMsg({ type: '', text: '' }); };

  return (
    <section className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Microsoft sign-in (SSO)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Let people sign in with their Microsoft 365 account. Roles and permissions stay in the portal.</p>
        </div>
        {status && (
          <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${status.active
            ? 'bg-green-50 text-green-700' : status.configured ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-800'}`}>
            {status.active ? 'On' : status.configured ? 'Off' : 'Not configured'}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {msg.text && (
          <p className={`px-3 py-2 rounded text-sm border ${msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
            {msg.text}
          </p>
        )}

        {!status ? (
          <div className="space-y-3"><SkeletonLine className="h-4 w-2/3" /><SkeletonLine className="h-4 w-1/2" /><SkeletonLine className="h-4 w-3/5" /></div>
        ) : (
          <>
            {/* Configuration (from .env) */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Connection (backend .env)</h3>
              {!status.configured && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
                  Missing: <span className="font-mono text-xs">{status.missing.join(', ')}</span>. Add them to the backend <span className="font-mono text-xs">.env</span> and restart it — see the setup steps below.
                </p>
              )}
              <div className="divide-y divide-gray-100">
                <Row k="Tenant ID" v={status.tenant_id} mono />
                <Row k="Client ID" v={status.client_id} mono />
                <Row k="Redirect URI" v={status.redirect_uri} mono />
                <Row k="Group restriction" v={status.group_restricted
                  ? 'On — only members of the configured Entra group'
                  : 'Off — anyone the Microsoft app allows (set MS_SSO_ALLOWED_GROUP_ID to restrict)'} />
              </div>
            </div>

            {/* Switches */}
            <form onSubmit={save} className="space-y-4 pt-1 border-t border-gray-100">
              <div className="pt-4 space-y-4">
                <Toggle checked={form.enabled} onChange={(v) => set('enabled', v)} disabled={!status.configured}
                  label="Enable Microsoft sign-in"
                  hint="Shows “Sign in with Microsoft” on the login page." />
                <Toggle checked={form.password_login} onChange={(v) => set('password_login', v)} disabled={!form.enabled}
                  label="Allow password sign-in for users"
                  hint="Turn off to make everyone use Microsoft. The Super Admin can always sign in with a password (emergency access)." />
                <Toggle checked={form.auto_create} onChange={(v) => set('auto_create', v)} disabled={!form.enabled}
                  label="Create portal users automatically on first sign-in"
                  hint="Off: only people already added in Users can sign in. On: anyone allowed by Microsoft gets an account with the role below." />
                {form.auto_create && form.enabled && (
                  <div className="pl-7">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Role for new users</label>
                    <select value={form.default_role_id} onChange={(e) => set('default_role_id', e.target.value)} required className="ams-input max-w-xs">
                      <option value="">— Choose a role —</option>
                      {roles.filter((r) => r.slug !== 'super-admin').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={saving} className="btn-primary px-4 py-2">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>

            {/* Setup steps for the Microsoft 365 admin */}
            <details className="rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700">
              <summary className="cursor-pointer font-medium text-gray-800">Setup steps for your Microsoft 365 administrator</summary>
              <ol className="list-decimal pl-5 mt-3 space-y-2">
                <li>Microsoft Entra admin center → <b>App registrations</b> → <b>New registration</b>. Name it (e.g. “Effee Portal”), choose <b>Single tenant</b>.</li>
                <li>Redirect URI: platform <b>Web</b>, value <span className="font-mono text-xs break-all">https://&lt;your-domain&gt;/api/v1/auth/sso/microsoft/callback</span> (must be HTTPS; <span className="font-mono text-xs">http://localhost</span> is allowed for testing).</li>
                <li>From <b>Overview</b> copy the <b>Directory (tenant) ID</b> and <b>Application (client) ID</b>.</li>
                <li><b>Certificates &amp; secrets</b> → <b>New client secret</b> → copy its <b>Value</b> (shown once). Note its expiry date.</li>
                <li>To limit access to a group: <b>Enterprise applications</b> → the app → <b>Properties</b> → <b>Assignment required = Yes</b>, then <b>Users and groups</b> → add the group.</li>
                <li>Optionally also set <span className="font-mono text-xs">MS_SSO_ALLOWED_GROUP_ID</span> (the group’s Object ID) and, in the app registration, <b>Token configuration</b> → <b>Add groups claim</b> → <b>Groups assigned to the application</b>.</li>
                <li>Put the values in the backend <span className="font-mono text-xs">.env</span> (MS_SSO_TENANT_ID, MS_SSO_CLIENT_ID, MS_SSO_CLIENT_SECRET, MS_SSO_REDIRECT_URI), restart the backend, then switch it on here.</li>
              </ol>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
