import { API_URL } from './config';
import { topLoader } from './topLoader';

const BASE_URL = API_URL;

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
async function request(endpoint, options = {}) {
  topLoader.start();
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Something went wrong');
    return data;
  } finally {
    topLoader.done();
  }
}

export function apiGet(endpoint) {
  return request(endpoint, { headers: authHeaders() });
}

export function apiPost(endpoint, body) {
  return request(endpoint, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
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
