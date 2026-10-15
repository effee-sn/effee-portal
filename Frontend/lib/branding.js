import { API_URL } from '@/lib/config';

/**
 * Server-side read of the public branding (company name + logo path). Used by
 * the manifest and the app-icon routes, which run on the server at request
 * time. Never throws: no branding → nulls.
 *
 * @returns {Promise<{ name: string|null, logo: string|null }>}
 */
export async function fetchBranding() {
  try {
    const res = await fetch(`${API_URL}/settings/branding`, { cache: 'no-store' });
    if (!res.ok) return { name: null, logo: null };
    const b = await res.json();
    return { name: b?.company_name || null, logo: b?.company_logo || null };
  } catch {
    return { name: null, logo: null };
  }
}
