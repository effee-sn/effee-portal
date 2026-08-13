'use client';

import { useEffect } from 'react';
import { apiGet } from '@/lib/api';
import { UPLOADS_URL } from '@/lib/config';

/**
 * Sets the browser tab favicon and the iOS home-screen icon to the uploaded
 * company logo on *every* page — including the unauthenticated login screen —
 * by reading the public `/settings/branding` endpoint. Renders nothing.
 *
 * The default Next.js favicon has been removed, so with no logo uploaded the tab
 * simply shows the browser's blank icon rather than someone else's branding.
 */
export default function BrandingIcons() {
  useEffect(() => {
    apiGet('/settings/branding', { silent: true })
      .then((b) => {
        if (!b?.company_logo) return;
        const href = `${UPLOADS_URL}${b.company_logo}`;
        for (const [id, rel] of [['company-favicon', 'icon'], ['company-apple-icon', 'apple-touch-icon']]) {
          let link = document.getElementById(id);
          if (!link) {
            link = document.createElement('link');
            link.id = id;
            link.rel = rel;
            document.head.appendChild(link);
          }
          link.href = href;
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
