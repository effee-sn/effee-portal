'use client';

import { useEffect, useState } from 'react';
import useAuth from '@/lib/useAuth';
import usePermissions from '@/lib/usePermissions';
import { apiGet, apiPut, apiPost } from '@/lib/api';
import { UPLOADS_URL } from '@/lib/config';

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Section({ title, description, children }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Alert({ type, message }) {
  if (!message) return null;
  const cls = type === 'success'
    ? 'bg-green-50 border-green-200 text-green-700'
    : 'bg-red-50 border-red-200 text-red-700';
  return <div className={`border px-4 py-3 rounded-lg text-sm ${cls}`}>{message}</div>;
}

function SaveBtn({ saving, label = 'Save Changes' }) {
  return (
    <button type="submit" disabled={saving} className="btn-primary">
      {saving ? 'Saving…' : label}
    </button>
  );
}

function Avatar({ name }) {
  const p   = (name || '').trim().split(' ').filter(Boolean);
  const ini = p.length >= 2 ? p[0][0] + p[p.length - 1][0] : (p[0] || '?').slice(0, 2);
  return (
    <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
      style={{ backgroundColor: 'var(--ams-primary)' }}>
      <span className="uppercase">{ini}</span>
    </div>
  );
}

function TabNav({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-gray-200 -mb-px">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className="px-5 py-2.5 text-sm font-medium border-b-2 transition-colors"
          style={
            active === t.key
              ? { borderColor: 'var(--ams-primary)', color: 'var(--ams-primary)' }
              : { borderColor: 'transparent', color: '#6B7280' }
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ me }) {
  const [profile,    setProfile]    = useState({ name: '', email: '', phone: '' });
  const [profMsg,    setProfMsg]    = useState({ type: '', text: '' });
  const [profSaving, setProfSaving] = useState(false);
  const [passwords,  setPasswords]  = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passMsg,    setPassMsg]    = useState({ type: '', text: '' });
  const [passSaving, setPassSaving] = useState(false);
  const [info,       setInfo]       = useState(null);

  useEffect(() => {
    if (!me) return;
    setProfile({ name: me.name || '', email: me.email || '', phone: '' });
    apiGet('/auth/profile')
      .then((u) => { setProfile({ name: u.name || '', email: u.email || '', phone: u.phone || '' }); setInfo(u); })
      .catch(() => setInfo({ name: me.name, email: me.email, role: me.role }));
  }, [me?.id]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profile.name.trim()) return setProfMsg({ type: 'error', text: 'Name is required' });
    setProfSaving(true); setProfMsg({ type: '', text: '' });
    try {
      await apiPut('/auth/profile', profile);
      setProfMsg({ type: 'success', text: 'Profile updated successfully' });
    } catch (err) { setProfMsg({ type: 'error', text: err.message }); }
    finally { setProfSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwords.new_password !== passwords.confirm_password)
      return setPassMsg({ type: 'error', text: 'New passwords do not match' });
    if (passwords.new_password.length < 6)
      return setPassMsg({ type: 'error', text: 'Password must be at least 6 characters' });
    setPassSaving(true); setPassMsg({ type: '', text: '' });
    try {
      await apiPut('/auth/change-password', {
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      });
      setPassMsg({ type: 'success', text: 'Password changed successfully' });
      setPasswords({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) { setPassMsg({ type: 'error', text: err.message }); }
    finally { setPassSaving(false); }
  };

  return (
    <div className="space-y-5">
      {/* Account Overview */}
      <Section title="Account Overview">
        <div className="flex items-center gap-4 mb-5">
          <Avatar name={info?.name || me?.name} />
          <div>
            <p className="text-sm font-semibold text-gray-900">{info?.name || me?.name || '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{info?.email || me?.email || '—'}</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium"
              style={{ backgroundColor: 'var(--ams-primary-mid)', color: 'var(--ams-primary)' }}>
              {info?.role?.name || me?.role?.name || '—'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-t border-gray-100 pt-4">
          {[
            { label: 'Member Since', value: info?.created_at ? new Date(info.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
            { label: 'Status',  value: info?.status },
            { label: 'Verified', value: info?.is_verified ? 'Yes' : 'No' },
            { label: 'Phone',   value: info?.phone },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
              <p className="text-gray-700 font-medium text-sm">{value || '—'}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Edit Profile — name/email/phone are identity fields managed centrally,
          so only a super admin sees the editable form. Everyone else changes
          only their password (below). */}
      {me?.is_system ? (
        <Section title="Edit Profile" description="Update your name, email and phone number">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <Alert type={profMsg.type} message={profMsg.text} />
            <Field label="Full Name">
              <input type="text" value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Your full name" className="ams-input" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Email">
                <input type="email" value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder="you@example.com" className="ams-input" />
              </Field>
              <Field label="Phone">
                <input type="text" value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="+91 XXXXX XXXXX" className="ams-input" />
              </Field>
            </div>
            <div className="flex justify-end pt-1"><SaveBtn saving={profSaving} /></div>
          </form>
        </Section>
      ) : (
        <Section title="Profile Details">
          <p className="text-sm text-gray-500">
            Your name, email and phone are managed by an administrator. Contact a super admin to update them.
          </p>
        </Section>
      )}

      {/* Permissions */}
      {info?.permsByModule && Object.keys(info.permsByModule).length > 0 && (
        <Section title="My Permissions" description="Based on your current role">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(info.permsByModule).map(([module, actions]) => (
              <div key={module} className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  {module === '_system' ? '★ System Admin' : module}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {actions.map((action) => (
                    <span key={action}
                      className="px-2 py-0.5 text-xs font-medium rounded capitalize"
                      style={{ backgroundColor: 'var(--ams-primary-mid)', color: 'var(--ams-primary)' }}>
                      {action.toLowerCase()}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Change Password */}
      <Section title="Change Password" description="Keep your account secure with a strong password">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Alert type={passMsg.type} message={passMsg.text} />
          <Field label="Current Password">
            <input type="password" value={passwords.current_password}
              onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
              placeholder="Enter current password" className="ams-input" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="New Password">
              <input type="password" value={passwords.new_password}
                onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
                placeholder="Min. 6 characters" className="ams-input" />
            </Field>
            <Field label="Confirm New Password">
              <input type="password" value={passwords.confirm_password}
                onChange={(e) => setPasswords({ ...passwords, confirm_password: e.target.value })}
                placeholder="Repeat new password" className="ams-input" />
            </Field>
          </div>
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={passSaving} className="btn-primary">
              {passSaving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </Section>
    </div>
  );
}

// ── Company Tab ───────────────────────────────────────────────────────────────
function CompanyTab() {
  const [info,     setInfo]     = useState({ company_name: '', company_address: '', company_phone: '', company_email: '', company_website: '', company_gstin: '' });
  const [infoMsg,  setInfoMsg]  = useState({ type: '', text: '' });
  const [infoSave, setInfoSave] = useState(false);

  const [smtp,     setSmtp]     = useState({ smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '', smtp_from_name: '', smtp_from_email: '', email_notifications: false });
  const [smtpMsg,  setSmtpMsg]  = useState({ type: '', text: '' });
  const [smtpSave, setSmtpSave] = useState(false);
  const [smtpPassSet, setSmtpPassSet] = useState(false);

  const [testTo,  setTestTo]  = useState('');
  const [testMsg, setTestMsg] = useState({ type: '', text: '' });
  const [testing, setTesting] = useState(false);

  const [logo,          setLogo]          = useState(null);
  const [logoPreview,   setLogoPreview]   = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMsg,       setLogoMsg]       = useState({ type: '', text: '' });

  useEffect(() => {
    apiGet('/settings').then((s) => {
      setInfo({ company_name: s.company_name || '', company_address: s.company_address || '', company_phone: s.company_phone || '', company_email: s.company_email || '', company_website: s.company_website || '', company_gstin: s.company_gstin || '' });
      setSmtp({ smtp_host: s.smtp_host || '', smtp_port: s.smtp_port || 587, smtp_user: s.smtp_user || '', smtp_pass: '', smtp_from_name: s.smtp_from_name || '', smtp_from_email: s.smtp_from_email || '', email_notifications: s.email_notifications || false });
      setSmtpPassSet(s.smtp_pass_set || false);
      if (s.company_logo) setLogoPreview(`${UPLOADS_URL}${s.company_logo}`);
    }).catch(() => {});
  }, []);

  const handleSaveInfo = async (e) => {
    e.preventDefault(); setInfoSave(true); setInfoMsg({ type: '', text: '' });
    try { await apiPut('/settings/company', info); setInfoMsg({ type: 'success', text: 'Saved successfully' }); }
    catch (err) { setInfoMsg({ type: 'error', text: err.message }); }
    finally { setInfoSave(false); }
  };

  const handleSaveSmtp = async (e) => {
    e.preventDefault(); setSmtpSave(true); setSmtpMsg({ type: '', text: '' });
    try {
      const payload = { ...smtp };
      if (!payload.smtp_pass) delete payload.smtp_pass;
      await apiPut('/settings/email', payload);
      setSmtpMsg({ type: 'success', text: 'Email settings saved' });
      setSmtp((p) => ({ ...p, smtp_pass: '' }));
      if (smtp.smtp_pass) setSmtpPassSet(true);
    } catch (err) { setSmtpMsg({ type: 'error', text: err.message }); }
    finally { setSmtpSave(false); }
  };

  const handleTestEmail = async (e) => {
    e.preventDefault();
    if (!testTo.trim()) return setTestMsg({ type: 'error', text: 'Enter a recipient email' });
    setTesting(true); setTestMsg({ type: '', text: '' });
    try {
      const res = await apiPost('/settings/test-email', { test_to: testTo });
      setTestMsg({ type: 'success', text: res.message });
    } catch (err) { setTestMsg({ type: 'error', text: err.message }); }
    finally { setTesting(false); }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogo(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleLogoUpload = async () => {
    if (!logo) return;
    setLogoUploading(true); setLogoMsg({ type: '', text: '' });
    try {
      const fd    = new FormData();
      fd.append('logo', logo);
      const token = localStorage.getItem('token');
      const { API_URL } = await import('@/lib/config');
      const res = await fetch(`${API_URL}/settings/logo`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      setLogoMsg({ type: 'success', text: 'Logo uploaded successfully' });
      setLogo(null);
    } catch (err) { setLogoMsg({ type: 'error', text: err.message }); }
    finally { setLogoUploading(false); }
  };

  return (
    <div className="space-y-5">
      {/* Company Info */}
      <Section title="Company Information" description="Appears on emails and reports sent to your team">
        <form onSubmit={handleSaveInfo} className="space-y-4">
          <Alert type={infoMsg.type} message={infoMsg.text} />
          <Field label="Company Name">
            <input type="text" value={info.company_name}
              onChange={(e) => setInfo({ ...info, company_name: e.target.value })}
              placeholder="Acme Pvt Ltd" className="ams-input" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Contact Email">
              <input type="email" value={info.company_email}
                onChange={(e) => setInfo({ ...info, company_email: e.target.value })}
                placeholder="accounts@company.com" className="ams-input" />
            </Field>
            <Field label="Contact Phone">
              <input type="text" value={info.company_phone}
                onChange={(e) => setInfo({ ...info, company_phone: e.target.value })}
                placeholder="+91 XXXXX XXXXX" className="ams-input" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Website">
              <input type="text" value={info.company_website}
                onChange={(e) => setInfo({ ...info, company_website: e.target.value })}
                placeholder="https://company.com" className="ams-input" />
            </Field>
            <Field label="GSTIN">
              <input type="text" value={info.company_gstin}
                onChange={(e) => setInfo({ ...info, company_gstin: e.target.value })}
                placeholder="22AAAAA0000A1Z5" className="ams-input" />
            </Field>
          </div>
          <Field label="Address">
            <textarea value={info.company_address}
              onChange={(e) => setInfo({ ...info, company_address: e.target.value })}
              rows={3} placeholder="Full company address" className="ams-input resize-none" />
          </Field>
          <div className="flex justify-end pt-1"><SaveBtn saving={infoSave} /></div>
        </form>
      </Section>

      {/* Logo */}
      <Section title="Company Logo" description="Displayed on email notifications (max 2 MB, image files only)">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
            {logoPreview
              ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
              : <span className="text-xs text-gray-400">No logo</span>}
          </div>
          <div className="flex-1 space-y-3">
            <Alert type={logoMsg.type} message={logoMsg.text} />
            <div className="flex items-center gap-3 flex-wrap">
              <label className="btn-secondary cursor-pointer">
                Choose File
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
              {logo && (
                <button onClick={handleLogoUpload} disabled={logoUploading} className="btn-primary">
                  {logoUploading ? 'Uploading…' : 'Upload'}
                </button>
              )}
              {logo && <span className="text-xs text-gray-500 truncate max-w-32">{logo.name}</span>}
            </div>
          </div>
        </div>
      </Section>

      {/* SMTP */}
      <Section title="Email / SMTP Settings" description="Configure outgoing email for notifications and password reset">
        <form onSubmit={handleSaveSmtp} className="space-y-4">
          <Alert type={smtpMsg.type} message={smtpMsg.text} />
          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
            <input type="checkbox" checked={smtp.email_notifications}
              onChange={(e) => setSmtp({ ...smtp, email_notifications: e.target.checked })}
              className="w-4 h-4 rounded" style={{ accentColor: 'var(--ams-primary)' }} />
            <span className="text-sm text-gray-700">Enable email notifications</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field label="SMTP Host" hint="e.g. smtp.gmail.com or smtp.sendgrid.net">
                <input type="text" value={smtp.smtp_host}
                  onChange={(e) => setSmtp({ ...smtp, smtp_host: e.target.value })}
                  placeholder="smtp.gmail.com" className="ams-input" />
              </Field>
            </div>
            <Field label="SMTP Port" hint="Usually 587 (TLS) or 465 (SSL)">
              <input type="number" value={smtp.smtp_port}
                onChange={(e) => setSmtp({ ...smtp, smtp_port: Number(e.target.value) })}
                placeholder="587" className="ams-input" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="SMTP Username / Email">
              <input type="text" value={smtp.smtp_user}
                onChange={(e) => setSmtp({ ...smtp, smtp_user: e.target.value })}
                placeholder="yourname@gmail.com" className="ams-input" />
            </Field>
            <Field label={smtpPassSet ? 'SMTP Password (leave blank to keep)' : 'SMTP Password'}
              hint={smtpPassSet ? 'A password is already saved.' : ''}>
              <input type="password" value={smtp.smtp_pass}
                onChange={(e) => setSmtp({ ...smtp, smtp_pass: e.target.value })}
                placeholder={smtpPassSet ? '••••••••' : 'App password or SMTP password'} className="ams-input" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="From Name">
              <input type="text" value={smtp.smtp_from_name}
                onChange={(e) => setSmtp({ ...smtp, smtp_from_name: e.target.value })}
                placeholder="Acme Corp" className="ams-input" />
            </Field>
            <Field label="From Email">
              <input type="email" value={smtp.smtp_from_email}
                onChange={(e) => setSmtp({ ...smtp, smtp_from_email: e.target.value })}
                placeholder="noreply@company.com" className="ams-input" />
            </Field>
          </div>
          <div className="flex justify-end pt-1"><SaveBtn saving={smtpSave} /></div>
        </form>

        <div className="mt-5 pt-5 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Test Email Connection</p>
          <form onSubmit={handleTestEmail} className="flex gap-2">
            <input type="email" value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Send test email to…"
              className="ams-input flex-1" />
            <button type="submit" disabled={testing} className="btn-secondary whitespace-nowrap">
              {testing ? 'Sending…' : 'Send Test'}
            </button>
          </form>
          {testMsg.text && <div className="mt-2"><Alert type={testMsg.type} message={testMsg.text} /></div>}
        </div>
      </Section>
    </div>
  );
}

// ── Security Tab ──────────────────────────────────────────────────────────────
function SecurityTab() {
  const [security,  setSecurity]  = useState({ login_max_attempts: 5, login_window_minutes: 15, max_upload_mb: 5 });
  const [secMsg,    setSecMsg]    = useState({ type: '', text: '' });
  const [secSaving, setSecSaving] = useState(false);

  useEffect(() => {
    apiGet('/settings').then((s) => {
      setSecurity({ login_max_attempts: s.login_max_attempts || 5, login_window_minutes: s.login_window_minutes || 15, max_upload_mb: s.max_upload_mb || 5 });
    }).catch(() => {});
  }, []);

  const handleSave = async (e) => {
    e.preventDefault(); setSecSaving(true); setSecMsg({ type: '', text: '' });
    try {
      await apiPut('/settings/security', security);
      setSecMsg({ type: 'success', text: 'Security settings saved. Rate limits apply immediately.' });
    } catch (err) { setSecMsg({ type: 'error', text: err.message }); }
    finally { setSecSaving(false); }
  };

  return (
    <div className="space-y-5">
      <Section title="Login Security" description="Control how many login attempts are allowed before an IP is temporarily blocked">
        <form onSubmit={handleSave} className="space-y-4">
          <Alert type={secMsg.type} message={secMsg.text} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Max Login Attempts" hint="Failed attempts before blocking (1–100)">
              <input type="number" min={1} max={100} value={security.login_max_attempts}
                onChange={(e) => setSecurity({ ...security, login_max_attempts: Number(e.target.value) })}
                className="ams-input" />
            </Field>
            <Field label="Block Window (minutes)" hint="How long to block after too many failures (1–1440)">
              <input type="number" min={1} max={1440} value={security.login_window_minutes}
                onChange={(e) => setSecurity({ ...security, login_window_minutes: Number(e.target.value) })}
                className="ams-input" />
            </Field>
          </div>

          <div className="p-3 rounded-lg border text-sm"
            style={{ backgroundColor: 'var(--ams-primary-mid)', borderColor: '#d9bdd1', color: '#5a3d54' }}>
            Block an IP after <strong>{security.login_max_attempts} failed attempts</strong> within{' '}
            <strong>{security.login_window_minutes} minutes</strong>. The block lifts automatically after the window expires.
          </div>

          <div className="pt-3 border-t border-gray-100">
            <Field label="Max File Upload Size (MB)" hint="Applies to attachments (1–50 MB)">
              <input type="number" min={1} max={50} value={security.max_upload_mb}
                onChange={(e) => setSecurity({ ...security, max_upload_mb: Number(e.target.value) })}
                className="ams-input" />
            </Field>
          </div>

          <div className="flex justify-end pt-1"><SaveBtn saving={secSaving} /></div>
        </form>
      </Section>

      <Section title="Security Tips">
        <ul className="space-y-2 text-sm text-gray-600">
          {[
            'Change the default admin password immediately after first login.',
            'Deactivate user accounts as soon as an employee leaves.',
            'Use a strong JWT_SECRET (min 32 random characters) in your server .env file.',
            'Keep your server OS and Node.js version updated regularly.',
            'Restrict SSH access to known IPs only via your firewall/security group.',
            'Set ALLOWED_ORIGIN to your exact frontend domain — never use a wildcard in production.',
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5" style={{ color: 'var(--ams-primary)' }}>✓</span>
              {tip}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  useAuth();
  const { me, loading: permLoading } = usePermissions();
  const isSystemAdmin = me?.is_system;

  const tabs = [
    { key: 'profile', label: 'My Profile' },
    ...(isSystemAdmin ? [
      { key: 'company',  label: 'Company'  },
      { key: 'security', label: 'Security' },
    ] : []),
  ];

  const [activeTab, setActiveTab] = useState('profile');

  if (permLoading || !me) return (
    <div className="space-y-4 animate-pulse max-w-2xl p-4">
      <div className="h-6 w-28 bg-gray-200 rounded" />
      <div className="h-px w-full bg-gray-200 rounded" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <div className="h-4 w-36 bg-gray-200 rounded" />
          {[1, 2].map((j) => <div key={j} className="h-9 bg-gray-100 rounded-lg" />)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-2xl p-4 pb-8">
      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-800">Settings</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {isSystemAdmin
            ? 'Manage your profile, company details and security configuration'
            : 'Manage your account and preferences'}
        </p>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="mb-5">
          <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />
        </div>
      )}

      {activeTab === 'profile'  && <ProfileTab  me={me} />}
      {activeTab === 'company'  && <CompanyTab  />}
      {activeTab === 'security' && <SecurityTab />}
    </div>
  );
}
