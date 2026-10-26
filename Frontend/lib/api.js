import { API_URL } from './config';
import { topLoader } from './topLoader';
import { endSession } from './session';

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

/** A plain-language message for a reply that isn't the API's JSON. */
function nonJsonMessage(status) {
  if (status === 413) {
    return 'This file is too large for the server. Ask your administrator to raise the upload limit (nginx client_max_body_size).';
  }
  if (status === 502 || status === 503 || status === 504) return 'The server isn’t responding right now. Please try again in a moment.';
  if (status === 404) return 'The server could not find this address (HTTP 404).';
  return `Unexpected response from the server (HTTP ${status}). Please try again.`;
}

/**
 * Reads a reply's body as the API's JSON. Something in front of the API (nginx,
 * a proxy) may answer with an HTML error page instead — e.g. 413 when an
 * upload is over its size limit — so a non-JSON body becomes `{ message }`
 * with a readable explanation rather than "Unexpected token '<'".
 * @param {Response} res
 * @returns {Promise<any>}
 */
export async function readBody(res) {
  const text = await res.text();
  if (!text) return res.ok ? null : { message: nonJsonMessage(res.status), nonJson: true };
  try { return JSON.parse(text); }
  catch { return { message: nonJsonMessage(res.status), nonJson: true }; }
}

/**
 * A 401 on a request that carried a token means the session is over (expired,
 * or the user was disabled): end it. A wrong password at login is also a 401,
 * but its code says so and there is no session to end.
 */
function endSessionOn401(res, headers, data) {
  if (res.status === 401 && headers?.Authorization && data?.code !== 'INVALID_CREDENTIALS') endSession('expired');
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
    const data = await readBody(res);
    endSessionOn401(res, options.headers, data);
    if (!res.ok || data?.nonJson) {
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

/**
 * Downloads a protected file: fetches it with the bearer token (a plain <a>
 * can't send the auth header), then saves the blob client-side.
 *
 * @param {string} endpoint
 * @param {string} [filename]
 */
export async function downloadFile(endpoint, filename) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  topLoader.start();
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = 'Download failed';
      const body = await readBody(res);
      endSessionOn401(res, token ? { Authorization: true } : null, body);
      msg = errorMessage(body);
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    topLoader.done();
  }
}
