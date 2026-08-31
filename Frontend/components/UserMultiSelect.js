'use client';

import { useMemo, useState } from 'react';

/**
 * A participants picker: a field that opens a popup where you search users,
 * tick as many as you like, and add them all at once. Works on a draft so
 * nothing is applied until "Add".
 *
 * @param {object} props
 * @param {{id:number,name:string}[]} props.users
 * @param {string[]} props.value  Selected user ids (as strings).
 * @param {(ids:string[])=>void} props.onChange
 * @param {string} [props.placeholder]
 */
export default function UserMultiSelect({ users = [], value = [], onChange, placeholder = 'Select participants…' }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState([]);

  const selectedNames = useMemo(() => {
    const set = new Set(value.map(String));
    return users.filter((u) => set.has(String(u.id))).map((u) => u.name);
  }, [users, value]);

  const filtered = query.trim()
    ? users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase()))
    : users;

  const draftSet = new Set(draft.map(String));
  const allFilteredChecked = filtered.length > 0 && filtered.every((u) => draftSet.has(String(u.id)));

  const openPopup = () => { setDraft(value.map(String)); setQuery(''); setOpen(true); };
  const toggle = (id) => {
    const s = new Set(draft.map(String));
    if (s.has(String(id))) s.delete(String(id)); else s.add(String(id));
    setDraft([...s]);
  };
  const toggleAllFiltered = () => {
    const s = new Set(draft.map(String));
    if (allFilteredChecked) filtered.forEach((u) => s.delete(String(u.id)));
    else filtered.forEach((u) => s.add(String(u.id)));
    setDraft([...s]);
  };
  const apply = () => { onChange(draft); setOpen(false); };

  return (
    <>
      <button type="button" onClick={openPopup}
        className="ams-input flex items-center justify-between text-left cursor-pointer">
        <span className={selectedNames.length ? 'text-gray-800 truncate' : 'text-gray-400'}>
          {selectedNames.length ? selectedNames.join(', ') : placeholder}
        </span>
        <svg className="w-4 h-4 text-gray-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-800">Select participants {draft.length ? `(${draft.length})` : ''}</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none cursor-pointer">&times;</button>
            </div>

            <div className="px-4 pt-3">
              <div className="flex items-center border border-gray-300 rounded overflow-hidden">
                <span className="px-2.5 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users…"
                  className="flex-1 min-w-0 py-2 pr-2 text-sm text-gray-700 outline-none" />
              </div>
            </div>

            {filtered.length > 0 && (
              <label className="flex items-center gap-2 px-5 py-2 text-xs font-medium text-gray-500 cursor-pointer border-b border-gray-100 mt-2">
                <input type="checkbox" checked={allFilteredChecked} onChange={toggleAllFiltered} className="rounded" />
                Select all{query.trim() ? ' (matching)' : ''}
              </label>
            )}

            <div className="flex-1 overflow-y-auto px-2 py-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 px-3 py-4 text-center">No users found.</p>
              ) : filtered.map((u) => (
                <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 rounded hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={draftSet.has(String(u.id))} onChange={() => toggle(u.id)} className="rounded" />
                  <span className="text-sm text-gray-700">{u.name}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3 px-5 py-3 border-t border-gray-100">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center py-2">Cancel</button>
              <button type="button" onClick={apply} className="btn-primary flex-1 justify-center py-2">Add {draft.length ? draft.length : ''}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
