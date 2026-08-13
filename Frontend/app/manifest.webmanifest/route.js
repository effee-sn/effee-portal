import { API_URL, UPLOADS_URL } from '@/lib/config';

/**
 * Installable web-app manifest, generated at request time so it reflects the
 * currently uploaded company logo. Read by the browser when the user installs
 * the portal ("Add to Home Screen" / "Install app"), which is why its icons —
 * not the favicon — decide the installed app icon.
 */
export const dynamic = 'force-dynamic';

const TYPE_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', png: 'image/png' };

export async function GET() {
  let name = 'Effee Portal';
  let iconUrl = null;

  try {
    const res = await fetch(`${API_URL}/settings/branding`, { cache: 'no-store' });
    if (res.ok) {
      const b = await res.json();
      if (b?.company_name) name = b.company_name;
      if (b?.company_logo) iconUrl = `${UPLOADS_URL}${b.company_logo}`;
    }
  } catch { /* fall back to defaults below */ }

  const type = iconUrl ? (TYPE_BY_EXT[iconUrl.split('.').pop().toLowerCase()] || 'image/png') : null;
  const icons = iconUrl
    ? [
      { src: iconUrl, sizes: '192x192', type, purpose: 'any' },
      { src: iconUrl, sizes: '512x512', type, purpose: 'any' },
      { src: iconUrl, sizes: '512x512', type, purpose: 'maskable' },
    ]
    : []; // no logo uploaded yet — no icon rather than the framework default

  const manifest = {
    name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1f2330',
    icons,
  };

  return Response.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' },
  });
}
