'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Issues (the issue logger) — shared state for the side panel.
 *
 * The dashboard layout holds one panel. Anything can open it: the floating
 * button, the Issues page, a record's "issues" chip. A record page registers
 * itself with `useIssueRecord` so a new issue raised there is tied to it
 * (module, record, label) — nothing to type.
 */

export const ISSUE_TYPES = [
  { value: 'QUESTION', label: 'Question' },
  { value: 'REQUEST',  label: 'Request' },
  { value: 'PROBLEM',  label: 'Problem' },
  { value: 'BUG',      label: 'Portal bug' },
];
export const TYPE_LABEL = Object.fromEntries(ISSUE_TYPES.map((t) => [t.value, t.label]));

export const PRIORITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label]));
export const PRIORITY_STYLE = {
  LOW: 'bg-gray-100 text-gray-600',
  NORMAL: 'bg-blue-50 text-blue-700',
  HIGH: 'bg-amber-50 text-amber-800',
  URGENT: 'bg-red-50 text-red-700',
};

export const STATUS = {
  OPEN:        { label: 'Open',        cls: 'bg-blue-50 text-blue-700' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-amber-50 text-amber-800' },
  RESOLVED:    { label: 'Resolved — to confirm', cls: 'bg-green-50 text-green-700' },
  CLOSED:      { label: 'Closed',      cls: 'bg-gray-100 text-gray-600' },
  CANCELLED:   { label: 'Cancelled',   cls: 'bg-gray-100 text-gray-500' },
};

/** Where the issue is now: a person, or a department's queue. */
export const withWhom = (i) => i.assignee?.name || (i.department ? `${i.department.name} — to assign` : '—');

/** An open issue whose due date has passed. */
export const isOverdue = (i) => Boolean(i.due_date) && ['OPEN', 'IN_PROGRESS'].includes(i.status)
  && new Date(i.due_date).setHours(23, 59, 59, 999) < Date.now();

const IssueContext = createContext(null);

/**
 * @typedef {{ module?: string, entity_type?: string, entity_id?: string|number, entity_label?: string }} IssueRecord
 * @typedef {{ mode: 'list'|'new'|'issue'|'record', id?: number, tab?: string }} PanelView
 */

export function IssueProvider({ children }) {
  const [view, setView] = useState(null); // null = closed
  const [record, setRecord] = useState(null);
  const [version, setVersion] = useState(0); // bumps when an issue changes, so lists and badges refresh

  const api = useMemo(() => ({
    view,
    record,
    version,
    open: (v = { mode: 'list' }) => setView(v),
    close: () => setView(null),
    changed: () => setVersion((n) => n + 1),
    setRecord,
  }), [view, record, version]);

  return <IssueContext.Provider value={api}>{children}</IssueContext.Provider>;
}

export function useIssues() {
  return useContext(IssueContext) || {
    view: null, record: null, version: 0, open: () => {}, close: () => {}, changed: () => {}, setRecord: () => {},
  };
}

/**
 * Ties new issues raised on this page to the record shown. Pass null while it
 * is loading.
 * @param {IssueRecord|null} rec
 */
export function useIssueRecord(rec) {
  const { setRecord } = useIssues();
  const key = rec ? JSON.stringify([rec.module, rec.entity_type, String(rec.entity_id), rec.entity_label]) : '';
  useEffect(() => {
    if (!key) return undefined;
    const [module, entity_type, entity_id, entity_label] = JSON.parse(key);
    setRecord({ module, entity_type, entity_id, entity_label });
    return () => setRecord(null);
  }, [key, setRecord]);
}
