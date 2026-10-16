/**
 * "What's new" — short, user-facing release notes, newest first.
 *
 * Shown once per user after each release (the popup), and any time from the
 * user menu. Written for the people using the portal — not CHANGELOG.md,
 * which is the full technical record. Keep 3–5 items per release; a release
 * with nothing visible to users can have no entry (no popup).
 *
 * `perm`: show the item only to users holding that permission (null = all).
 */

/** @type {Array<{ version: string, date: string, items: Array<{ icon: string, title: string, text: string, perm: string|null }> }>} */
export const RELEASES = [
  {
    version: '1.1.1',
    date: '2026-10-16',
    items: [
      {
        icon: 'swap',
        title: 'Work the enquiries that are with you',
        text: 'When the flow hands an enquiry to you, you can do your stage’s work — activities, reviews, documents, the offer — without any extra permission. It becomes read-only for you once it moves on.',
        perm: 'SALES_VIEW',
      },
      {
        icon: 'lock',
        title: 'Won, Lost and Reopen',
        text: 'Won is marked by the person who raised the enquiry; Lost by whoever has it, including Internal Sales. Reopening a closed enquiry needs the Sales → Reassign permission.',
        perm: 'SALES_VIEW',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-16',
    items: [
      {
        icon: 'theme',
        title: 'Dark mode',
        text: 'Pick Light, Dark or System from the new button next to the bell (or in Settings → Profile). Your choice follows you to any computer.',
        perm: null,
      },
      {
        icon: 'lock',
        title: 'Your own data on enquiries',
        text: 'Enquiry details can be changed only by the person who raised it. Documents, activities and reviews can be replaced, edited or deleted only by whoever added them.',
        perm: 'SALES_VIEW',
      },
      {
        icon: 'swap',
        title: 'Reassigning has its own permission',
        text: 'Reassigning an enquiry or changing its owner now needs the Sales → Reassign permission. Ask your administrator if you need it.',
        perm: 'SALES_VIEW',
      },
      {
        icon: 'grid',
        title: 'Roles show every permission',
        text: 'The permission matrix now includes the Export (Reports) and Reassign (Sales) columns.',
        perm: 'ROLE_VIEW',
      },
      {
        icon: 'spark',
        title: 'What’s new',
        text: 'This window. It appears once after each update — open it again any time from the ✨ button in the top bar.',
        perm: null,
      },
    ],
  },
];

/** -1 / 0 / 1 comparing "1.2.0"-style versions; a missing version sorts first. */
export function compareVersions(a, b) {
  if (!a) return b ? -1 : 0;
  if (!b) return 1;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  }
  return 0;
}

/**
 * Releases to show, with only the items this user should see.
 * @param {(code: string) => boolean} can
 * @param {{ after?: string|null, upTo: string }} range  after = last seen (exclusive)
 */
export function releasesFor(can, { after = null, upTo }) {
  return RELEASES
    .filter((r) => compareVersions(r.version, upTo) <= 0 && (after == null || compareVersions(r.version, after) > 0))
    .map((r) => ({ ...r, items: r.items.filter((i) => !i.perm || can(i.perm)) }))
    .filter((r) => r.items.length > 0);
}
