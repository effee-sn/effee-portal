'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';

/**
 * Department Codes — a section of Administrator → Configuration.
 *
 * Each department's code in project tag numbers (Machine ID - code -
 * subassembly - part), e.g. ELE, 12 or PS-01: pick a department, give it a
 * code; change or remove it later. Codes are unique. A locked project BOM
 * keeps the tags it was locked with; a new code applies to BOMs locked after.
 */

const label = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
/** What a code may be: letters, numbers and single hyphens, up to 10 (kept in capitals). */
const clean = (v) => v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10);

/** @param {{ has: (code: string) => boolean }} props */
export default function DepartmentCodesConfig({ has }) {
  const canView = has('PROJECT_CONFIG_VIEW');
  const canEdit = has('PROJECT_CONFIG_EDIT');
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState({ department_id: '', code: '' });
  const [editing, setEditing] = useState(null); // { id, code }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    apiGet('/projects/department-codes')
      .then((r) => { if (!cancelled) setRows(r.data); })
      .catch((e) => { if (!cancelled) { setRows([]); setError(e.message); } });
    return () => { cancelled = true; };
  }, [canView]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">Access Denied</p>
        <p className="text-sm text-gray-500">You don&apos;t have permission to view the department codes.</p>
      </div>
    );
  }
  if (!rows) return <div className="bg-white rounded border border-gray-200 overflow-hidden"><TableSkeleton cols={3} rows={4} /></div>;

  const coded = rows.filter((d) => d.dept_code);
  const uncoded = rows.filter((d) => !d.dept_code);

  const save = async (departmentId, code, okMsg) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await apiPut(`/projects/department-codes/${departmentId}`, { code });
      setRows(r.data);
      setNotice(okMsg);
      return true;
    } catch (err) { setError(err.message); return false; }
    finally { setBusy(false); }
  };

  const add = async (e) => {
    e.preventDefault();
    const dept = rows.find((d) => String(d.id) === adding.department_id);
    if (!dept || !adding.code) return;
    if (await save(dept.id, adding.code, `${dept.name} now has code ${adding.code}.`)) setAdding({ department_id: '', code: '' });
  };
  const saveEdit = async (dept) => {
    if (!editing.code) return;
    if (await save(dept.id, editing.code, `${dept.name}'s code is now ${editing.code}.`)) setEditing(null);
  };
  const remove = (dept) => {
    if (!window.confirm(`Remove ${dept.name}'s code ${dept.dept_code}? Its subassemblies can't go on a project BOM that is locked until it has a code again.`)) return;
    save(dept.id, null, `${dept.name}'s code removed.`);
  };

  return (
    <div className="bg-white rounded border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">Department Codes</span>
        <span className="ml-2 text-xs text-gray-400">Each department&apos;s code in project tag numbers</span>
      </div>
      <div className="px-4 py-4 space-y-4 max-w-2xl">
        <p className="text-xs text-gray-500">
          Tags read <span className="font-mono">Machine ID - department code - subassembly - part</span>, e.g.
          <span className="font-mono"> M0001-ELE-EI-DWG-1001</span>. A locked project BOM keeps its tags; a changed code applies to BOMs locked after.
        </p>
        {error && <p className="px-3 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-700">{error}</p>}
        {notice && <p className="px-3 py-2 rounded text-sm border bg-green-50 border-green-200 text-green-800">{notice}</p>}

        {coded.length === 0 ? (
          <p className="py-4 text-sm text-gray-400">No department has a code yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-normal">Department</th>
                <th className="py-2 pr-3 font-normal">Code</th>
                <th className="py-2 w-40" />
              </tr>
            </thead>
            <tbody>
              {coded.map((d) => (
                <tr key={d.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 text-gray-800">{d.name}</td>
                  <td className="py-2 pr-3">
                    {editing?.id === d.id ? (
                      <input value={editing.code} onChange={(e) => { setEditing({ ...editing, code: clean(e.target.value) }); setError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(d); } if (e.key === 'Escape') setEditing(null); }}
                        autoFocus aria-label={`Code for ${d.name}`} className="ams-input font-mono w-32 py-1" />
                    ) : <span className="font-mono font-semibold text-gray-800">{d.dept_code}</span>}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {canEdit && (editing?.id === d.id ? (
                      <>
                        <button type="button" onClick={() => saveEdit(d)} disabled={busy || !editing.code} className="text-xs font-medium text-[var(--ams-primary)] hover:underline cursor-pointer px-2 disabled:opacity-40">Save</button>
                        <button type="button" onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer px-2">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setEditing({ id: d.id, code: d.dept_code }); setError(''); setNotice(''); }} disabled={busy} className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer px-2">Edit</button>
                        <button type="button" onClick={() => remove(d)} disabled={busy} className="text-xs text-red-500 hover:text-red-700 cursor-pointer px-2">Remove</button>
                      </>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canEdit && (
          uncoded.length === 0 ? (
            <p className="text-xs text-gray-500">Every department has a code.</p>
          ) : (
            <form onSubmit={add} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className={label} htmlFor="dc-dept">Department</label>
                <select id="dc-dept" value={adding.department_id} onChange={(e) => { setAdding((a) => ({ ...a, department_id: e.target.value })); setError(''); setNotice(''); }}
                  required className="ams-input bg-white">
                  <option value="">Select a department…</option>
                  {uncoded.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="dc-code">Code</label>
                <input id="dc-code" value={adding.code} onChange={(e) => { setAdding((a) => ({ ...a, code: clean(e.target.value) })); setError(''); }}
                  required placeholder="e.g. ELE" className="ams-input font-mono w-32 bg-white" />
              </div>
              <button type="submit" disabled={busy || !adding.department_id || !adding.code} className="btn-primary px-4 py-1.5 disabled:opacity-40">
                {busy ? 'Saving…' : 'Add'}
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
}
