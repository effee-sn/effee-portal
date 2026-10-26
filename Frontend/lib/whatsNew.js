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
    version: '1.5.0',
    date: '2026-10-27',
    items: [
      {
        icon: 'grid',
        title: 'Kanban view of the enquiries',
        text: 'Sales → Enquiries now has a List / Kanban switcher. The Kanban shows a column for every stage with its enquiries as cards — open one to work on it.',
        perm: 'SALES_VIEW',
      },
      {
        icon: 'spark',
        title: 'See who logged each activity and review',
        text: 'Every activity and review now shows who logged it and when — and, if it was corrected later, who edited it and when.',
        perm: 'SALES_VIEW',
      },
      {
        icon: 'spark',
        title: 'Signed out automatically when your session expires',
        text: 'When your sign-in expires, the portal now takes you to the login page by itself — no more failing screens until you log out and back in.',
        perm: null,
      },
    ],
  },
  {
    version: '1.4.3',
    date: '2026-10-27',
    items: [
      {
        icon: 'spark',
        title: 'Who can correct their activities and reviews — set per role',
        text: 'Editing the activities and reviews you logged is now the “Sales activity → Edit” permission, set in Roles. Nobody can edit someone else’s entries.',
        perm: 'ROLE_EDIT',
      },
      {
        icon: 'spark',
        title: 'Activities and reviews stay with their stage',
        text: 'You can correct an activity or review you logged while the enquiry is still in that stage. Once it moves on, that stage’s entries are kept as they are. Only a review logged in the Review stage can conclude it.',
        perm: 'SALES_VIEW',
      },
    ],
  },
  {
    version: '1.4.2',
    date: '2026-10-27',
    items: [
      {
        icon: 'spark',
        title: 'Correct your own activities and reviews',
        text: 'You can now edit any activity or review you logged, to fix a mistake — no extra permission needed. Only the person who logged an entry can edit it.',
        perm: 'SALES_VIEW',
      },
    ],
  },
  {
    version: '1.4.1',
    date: '2026-10-26',
    items: [
      {
        icon: 'spark',
        title: 'Activities and reviews: the enquiry’s holder can always log',
        text: 'Whoever an enquiry is with right now (for example Internal Sales at Review) can log activities and reviews with Sales view access alone. Others need view and create access. Once an enquiry is won or lost, no new activities or reviews are added.',
        perm: 'SALES_VIEW',
      },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-25',
    items: [
      {
        icon: 'spark',
        title: 'Log activities and reviews at any stage',
        text: 'Activities and reviews can now be logged at every stage of an enquiry, not only by the person it is with. You can edit or delete your own entries if you have Sales edit / delete access.',
        perm: 'SALES_VIEW',
      },
    ],
  },
  {
    version: '1.3.1',
    date: '2026-10-24',
    items: [
      {
        icon: 'grid',
        title: 'Rows per page',
        text: 'Lists now have a “per page” dropdown next to the page counter — show 10, 20, 50 or 100 rows. Your choice is remembered for each list.',
        perm: null,
      },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-23',
    items: [
      {
        icon: 'spark',
        title: 'Refurbishment enquiries',
        text: 'Tick “Refurbishment enquiry” when creating an enquiry: it skips the Concept stage and goes from Review straight to Costing. It can be changed until the Review stage.',
        perm: 'SALES_VIEW',
      },
    ],
  },
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
