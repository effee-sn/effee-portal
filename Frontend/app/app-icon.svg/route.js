import { UPLOADS_URL } from '@/lib/config';
import { fetchBranding } from '@/lib/branding';

/**
 * The installed-app icon: the uploaded company logo, centred on a white
 * square with padding.
 *
 * App icons must be square (and at least 192 px); a company logo usually
 * isn't, and browsers reject or squash it. An SVG wrapper solves that without
 * any image library: it scales to every size the browser asks for. The logo is
 * embedded as a data URI because an SVG used as an image may not load external
 * files.
 *
 *   /app-icon.svg              — padded for a normal icon
 *   /app-icon.svg?maskable=1   — more padding, inside the safe zone that
 *                                Android/Windows may crop to a circle or squircle
 *
 * 404 when no logo is uploaded, so the browser falls back to its default.
 */
export const dynamic = 'force-dynamic';

const TYPE_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', png: 'image/png', svg: 'image/svg+xml' };
const SIZE = 512;

export async function GET(request) {
  const { logo } = await fetchBranding();
  if (!logo) return new Response('No logo', { status: 404 });

  let bytes;
  try {
    const res = await fetch(`${UPLOADS_URL}${logo}`, { cache: 'no-store' });
    if (!res.ok) return new Response('Logo unavailable', { status: 404 });
    bytes = Buffer.from(await res.arrayBuffer());
  } catch {
    return new Response('Logo unavailable', { status: 404 });
  }

  const type = TYPE_BY_EXT[logo.split('.').pop().toLowerCase()] || 'image/png';
  const maskable = new URL(request.url).searchParams.get('maskable') === '1';
  // Maskable icons keep their content inside the central 80% circle.
  const pad = maskable ? 100 : 40;
  const inner = SIZE - pad * 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`
    + `<rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>`
    + `<image x="${pad}" y="${pad}" width="${inner}" height="${inner}" preserveAspectRatio="xMidYMid meet" `
    + `href="data:${type};base64,${bytes.toString('base64')}" xlink:href="data:${type};base64,${bytes.toString('base64')}"/>`
    + '</svg>';

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      // Short cache: a new logo shows up within minutes (the manifest also
      // versions the URL by logo file, so installs pick it up straight away).
      'Cache-Control': 'public, max-age=300',
    },
  });
}
