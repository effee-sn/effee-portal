import { API_URL } from './config';
import { topLoader } from './topLoader';

const BASE_URL = API_URL;

/** "assignee_user_id" → "Assignee user id" (last path segment, humanised). */
function humaniseField(field) {
  const leaf = String(field).split('.').pop();
  const spaced = leaf.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Builds a readable error string from an error response. Validation failures
 * carry per-field details (`[{ field, message }]`); without this the UI only
 * ever showed the generic top-level "Validation failed".
 */
function errorMessage(data) {
  if (Array.isArray(data?.details) && data.details.length) {
    return data.details
      .map((d) => (d.field && d.field !== '_' ? `${humaniseField(d.field)}: ${d.message}` : d.message))
      .filter(Boolean)
      .join(' • ');
  }
  return data?.message || 'Something went wrong';
}

function authHeaders(extra = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/**
 * Shared request wrapper. Drives the top progress bar for the duration of every
 * call — so lists loading, saves, deletes, and any action show the same loader
 * the navbar links do, and the user always sees that something is happening.
 *
 * @param {string} endpoint
 * @param {RequestInit} [options]
 * @returns {Promise<any>} Parsed JSON body.
 */
async function request(endpoint, options = {}, { silent = false } = {}) {
  // Silent requests (e.g. the notification poll every few seconds) skip the top
  // progress bar so it doesn't flash as if the page were loading.
  if (!silent) topLoader.start();
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(errorMessage(data));
      err.status = res.status;
      err.code = data?.code;
      err.details = data?.details;
      throw err;
    }
    return data;
  } finally {
    if (!silent) topLoader.done();
  }
}

export function apiGet(endpoint, opts = {}) {
  return request(endpoint, { headers: authHeaders() }, opts);
}

export function apiPost(endpoint, body, opts = {}) {
  return request(endpoint, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }, opts);
}

export function apiPut(endpoint, body) {
  return request(endpoint, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
}

export function apiDelete(endpoint) {
  return request(endpoint, { method: 'DELETE', headers: authHeaders() });
}

export function apiPostForm(endpoint, formData, method = 'POST') {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return request(endpoint, { method, headers, body: formData });
}
