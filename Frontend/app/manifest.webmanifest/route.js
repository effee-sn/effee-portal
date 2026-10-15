import { fetchBranding } from '@/lib/branding';

/**
 * Installable web-app manifest, generated at request time so it reflects the
 * currently uploaded company logo. Read by the browser when the user installs
 * the portal ("Add to Home Screen" / "Install app"), which is why its icons —
 * not the favicon — decide the installed app icon.
 *
 * The icons point at /app-icon.svg: the logo on a white square, because app
 * icons must be square and a company logo usually isn't. The `v` parameter is
 * the logo file, so uploading a new logo gives the icon a new URL.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const branding = await fetchBranding();
  const name = branding.name || 'Effee Portal';

  const v = branding.logo ? encodeURIComponent(branding.logo.split('/').pop()) : null;
  const icons = v
    ? [
      { src: `/app-icon.svg?v=${v}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: `/app-icon.svg?v=${v}`, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      { src: `/app-icon.svg?maskable=1&v=${v}`, sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
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
