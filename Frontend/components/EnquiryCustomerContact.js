'use client';

import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

/**
 * Combined customer + contact picker for the enquiry form.
 *
 * Customer: a searchable popover over the customer master. If the typed name
 * matches nothing, it offers to create that customer on the spot. Contact:
 * once a customer is chosen its contacts load — pick one, or add a new contact
 * (name + number) inline when there are none (or when you want another).
 *
 * Creating a customer/contact here writes to the master immediately (via the
 * existing endpoints), so the enquiry can reference real ids. Reports the
 * chosen ids up through `onChange({ customer_id, contact_id })`.
 *
 * @param {object} props
 * @param {{id:number,name:string}|null} [props.initialCustomer]
 * @param {number|null} [props.initialContactId]
 * @param {(v:{customer_id:number|'' , contact_id:number|''})=>void} props.onChange
 */
export default function EnquiryCustomerContact({ initialCustomer = null, initialContactId = null, onChange }) {
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';

  // ── Customer picker ─────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(initialCustomer);
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');
  const boxRef = useRef(null);

  // ── Contacts ────────────────────────────────────────────────────────────────
  const [contacts, setContacts]         = useState([]);
  const [contactId, setContactId]       = useState(initialContactId || '');
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact]     = useState({ name: '', phone: '' });
  const [savingContact, setSavingContact] = useState(false);

  // Report the current selection upward whenever it changes.
  useEffect(() => {
    onChange?.({ customer_id: selected?.id || '', contact_id: contactId || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, contactId]);

  // Close the popover on an outside click.
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Search the customer master while the popover is open (debounced).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiGet(`/customers?search=${encodeURIComponent(query)}&limit=20`, { silent: true });
        setResults(res.data || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  // Load the chosen customer's contacts.
  useEffect(() => {
    let cancelled = false;
    if (!selected?.id) { setContacts([]); setContactId(''); setAddingContact(false); return; }
    apiGet(`/customers/${selected.id}`, { silent: true })
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.contacts || [];
        setContacts(list);
        const keep = initialContactId && list.some((c) => c.id === initialContactId) ? initialContactId : '';
        setContactId(keep);
        setAddingContact(list.length === 0); // no contacts → open the add form
      })
      .catch(() => { if (!cancelled) { setContacts([]); setAddingContact(true); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const pickCustomer = (c) => { setSelected(c); setOpen(false); setQuery(''); setError(''); };

  const createCustomer = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true); setError('');
    try {
      const res = await apiPost('/customers', { name });
      pickCustomer(res.data);
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  const saveContact = async () => {
    if (!selected?.id || !newContact.name.trim()) return;
    setSavingContact(true); setError('');
    try {
      const res = await apiPost(`/customers/${selected.id}/contacts`, {
        name: newContact.name.trim(),
        phone: newContact.phone.trim(),
      });
      setContacts((prev) => [...prev, res.data]);
      setContactId(res.data.id);
      setNewContact({ name: '', phone: '' });
      setAddingContact(false);
    } catch (e) { setError(e.message); }
    finally { setSavingContact(false); }
  };

  const trimmed = query.trim();
  const exactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Customer */}
      <div ref={boxRef} className="relative">
        <label className={labelCls}>Customer<span className="text-red-500"> *</span></label>
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="ams-input flex items-center justify-between text-left cursor-pointer">
          <span className={selected ? 'text-gray-800 truncate' : 'text-gray-400'}>
            {selected ? selected.name : 'Search or add a customer…'}
          </span>
          <svg className="w-4 h-4 text-gray-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center border-b border-gray-100 px-2.5">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a customer name…"
                className="flex-1 min-w-0 py-2 px-2 text-sm text-gray-700 outline-none" />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {searching && <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>}
              {!searching && results.map((c) => (
                <button type="button" key={c.id} onClick={() => pickCustomer(c)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <div className="text-sm text-gray-800">{c.name}</div>
                  <div className="text-xs text-gray-400">
                    {[c.gstin, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'No details yet'}
                  </div>
                </button>
              ))}
              {!searching && results.length === 0 && !trimmed && (
                <div className="px-3 py-2 text-xs text-gray-400">Start typing to search customers.</div>
              )}
              {!searching && trimmed && !exactMatch && (
                <button type="button" onClick={createCustomer} disabled={creating}
                  className="w-full text-left px-3 py-2 border-t border-gray-100 hover:bg-blue-50 text-sm text-blue-600 cursor-pointer disabled:opacity-50">
                  {creating ? 'Adding…' : <>➕ Add “<span className="font-medium">{trimmed}</span>” as a new customer</>}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contact */}
      <div>
        <label className={labelCls}>Contact <span className="text-gray-400 font-normal normal-case">(optional)</span></label>

        {!selected ? (
          <div className="ams-input flex items-center text-gray-400 cursor-not-allowed">Select a customer first</div>
        ) : !addingContact ? (
          <div className="flex items-center gap-2">
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="ams-input flex-1">
              <option value="">— None —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.designation ? ` (${c.designation})` : ''}{c.phone ? ` · ${c.phone}` : ''}</option>
              ))}
            </select>
            <button type="button" onClick={() => setAddingContact(true)}
              className="shrink-0 px-2.5 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded cursor-pointer whitespace-nowrap">
              ＋ New
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.length === 0 && (
              <p className="text-xs text-gray-400">No contacts for this customer yet — add one below.</p>
            )}
            <div className="flex items-center gap-2">
              <input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder="Contact name" className="ams-input flex-1" />
              <input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                placeholder="Phone / number" className="ams-input flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={saveContact} disabled={savingContact || !newContact.name.trim()}
                className="px-3 py-1.5 text-xs font-medium text-white rounded cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--ams-primary)' }}>
                {savingContact ? 'Adding…' : 'Add contact'}
              </button>
              {contacts.length > 0 && (
                <button type="button" onClick={() => { setAddingContact(false); setNewContact({ name: '', phone: '' }); }}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded cursor-pointer">
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <div className="sm:col-span-2 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-600 text-xs">{error}</div>}
    </div>
  );
}
