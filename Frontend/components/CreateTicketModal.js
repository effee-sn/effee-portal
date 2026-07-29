'use client';

import { useState } from 'react';
import { apiPost } from '@/lib/api';

/**
 * New Service Ticket modal.
 *
 * Shared so any surface a creator lands on can raise a ticket — the Services
 * list (for viewers) and My Tickets (for a Ticket Creator who has SERVICE_CREATE
 * but not SERVICE_VIEW, and so never sees the list).
 *
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {(ticket: object) => void} props.onCreated Receives the created ticket.
 */
export default function CreateTicketModal({ onClose, onCreated }) {
  const [form, setForm] = useState(() => {
    // Pre-fill the complaint date/time with now, as a convenience.
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return {
      ticket_type: 'CALL',
      complaint_date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      complaint_time: `${p(d.getHours())}:${p(d.getMinutes())}`,
      issue_title: '',
      company_name: '',
      company_location: '',
      reported_by: '',
      reported_by_phone: '',
      reported_by_email: '',
      support_type: '',
      machine_project: '',
      machine_serial_no: '',
      issue_severity: 'MEDIUM',
      issue_description: '',
      production_impact: false,
      production_impact_details: '',
      customer_impact: false,
      customer_impact_details: '',
      safety_impact: false,
      safety_impact_details: '',
    };
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => {
      const next = { ...f, [name]: type === 'checkbox' ? checked : value };
      // Unchecking an impact clears its details, so a hidden note can't be sent.
      if (type === 'checkbox' && !checked && `${name}_details` in next) {
        next[`${name}_details`] = '';
      }
      return next;
    });
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await apiPost('/service/tickets', form);
      onCreated(res.data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl bg-white rounded-lg shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">New Service Ticket</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2.5 rounded bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

          <div className="px-3 py-2 rounded bg-gray-50 border border-gray-100 text-xs text-gray-500">
            Ticket ID is generated automatically on save (e.g. SRV-000001).
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Ticket Type</label>
              <select name="ticket_type" value={form.ticket_type} onChange={change} className="ams-input">
                <option value="CALL">Call</option>
                <option value="EMAIL">Email</option>
              </select>
            </div>
            <div>
              <label className={label}>Severity</label>
              <select name="issue_severity" value={form.issue_severity} onChange={change} className="ams-input">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Complaint Date</label>
              <input type="date" name="complaint_date" value={form.complaint_date} onChange={change} className="ams-input" />
            </div>
            <div>
              <label className={label}>Complaint Time</label>
              <input type="time" name="complaint_time" value={form.complaint_time} onChange={change} className="ams-input" />
            </div>
          </div>

          <div>
            <label className={label}>Issue Title</label>
            <input name="issue_title" value={form.issue_title} onChange={change} required
              placeholder="Short summary of the issue" className="ams-input" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Company Name</label>
              <input name="company_name" value={form.company_name} onChange={change} required
                placeholder="Acme Corp" className="ams-input" />
            </div>
            <div>
              <label className={label}>Company Location</label>
              <input name="company_location" value={form.company_location} onChange={change}
                placeholder="City / site" className="ams-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Reported By</label>
              <input name="reported_by" value={form.reported_by} onChange={change} required
                placeholder="Person who reported it" className="ams-input" />
            </div>
            <div>
              <label className={label}>Reporter Phone</label>
              <input name="reported_by_phone" value={form.reported_by_phone} onChange={change}
                placeholder="Contact number" className="ams-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Reporter Email</label>
              <input type="email" name="reported_by_email" value={form.reported_by_email} onChange={change}
                placeholder="name@company.com" className="ams-input" />
            </div>
            <div>
              <label className={label}>Support Type</label>
              <select name="support_type" value={form.support_type} onChange={change} className="ams-input">
                <option value="">— Select —</option>
                <option value="REMOTE">Remote (On-call)</option>
                <option value="SITE_VISIT">Site Visit</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Machine / Project</label>
              <input name="machine_project" value={form.machine_project} onChange={change}
                placeholder="Machine or project" className="ams-input" />
            </div>
            <div>
              <label className={label}>Machine Serial No</label>
              <input name="machine_serial_no" value={form.machine_serial_no} onChange={change}
                placeholder="Serial number" className="ams-input" />
            </div>
          </div>

          <div>
            <label className={label}>Issue Description</label>
            <textarea name="issue_description" value={form.issue_description} onChange={change} required rows={4}
              placeholder="Full details of the issue…" className="ams-input resize-none" />
          </div>

          <div className="space-y-3 pt-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Impact</p>
            {[
              ['production_impact', 'Production impact'],
              ['customer_impact', 'Customer impact'],
              ['safety_impact', 'Safety impact'],
            ].map(([name, lbl]) => (
              <div key={name}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" name={name} checked={form[name]} onChange={change}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--ams-primary)' }} />
                  <span className="text-sm text-gray-700">{lbl}</span>
                </label>

                {/* Details reveal only when the box is ticked. Optional. */}
                {form[name] && (
                  <textarea name={`${name}_details`} value={form[`${name}_details`]} onChange={change} rows={2}
                    placeholder={`Details about ${lbl.toLowerCase()} (optional)`}
                    className="ams-input resize-none mt-2" />
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2 pb-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center py-2">
              {saving ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
