/**
 * Application navigation model.
 *
 * The portal is organised into areas (Odoo-style "apps"). The top-bar app
 * switcher toggles between them, and the bar shows the active area's menu. This
 * is the single source of truth for both — the layout renders from it, so
 * adding a menu item or an area is an edit here, not in the layout markup.
 *
 * Each item's `perm` gates it on a permission code (null = always visible). An
 * area appears only when the user can see at least one of its items, which
 * reuses the existing permission logic rather than inventing a new gate.
 */

/**
 * @typedef {object} NavItem
 * @property {string} label
 * @property {string} href
 * @property {string|null} perm Permission code, or null for always-visible.
 * @property {boolean} [exact] Match the path exactly (used for the dashboard root).
 */

/**
 * @typedef {object} Area
 * @property {string} key
 * @property {string} label
 * @property {string} subtitle
 * @property {NavItem[]} items
 */

// Order here is the order shown in the app switcher. Dashboard is the landing
// home; Administrator holds only system configuration. The active app is
// resolved from the URL by areaKeyForPath, so this ordering is presentational.
/** @type {Area[]} */
export const AREAS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    subtitle: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', perm: null, exact: true },
    ],
  },
  {
    key: 'service',
    label: 'Service',
    subtitle: 'Service operations',
    items: [
      { label: 'Dashboard',   href: '/dashboard/service',          perm: 'SERVICE_VIEW', exact: true },
      { label: 'Services',    href: '/dashboard/service/tickets',   perm: 'SERVICE_VIEW' },
      // No permission — visible to everyone; the inbox is empty unless the flow
      // has assigned you something.
      { label: 'My Tickets',  href: '/dashboard/service/inbox',     perm: null },
    ],
  },
  {
    key: 'administrator',
    label: 'Administrator',
    subtitle: 'System configuration',
    items: [
      { label: 'Users',        href: '/dashboard/users',       perm: 'USER_VIEW' },
      { label: 'Roles',        href: '/dashboard/roles',       perm: 'ROLE_VIEW' },
      { label: 'Departments',  href: '/dashboard/departments', perm: 'DEPT_VIEW' },
      // Flow Builder is hidden: ticket routing is handled by the parallel
      // department-task model, so the workflow is a fixed backbone (triage →
      // customer confirm) that must not be edited. The seeded flow stays intact.
      { label: 'Settings',     href: '/dashboard/settings',    perm: null },
    ],
  },
];

/**
 * The area a path belongs to.
 *
 * Picks the most specific matching item so overlapping prefixes resolve
 * correctly — `/dashboard` maps to the Dashboard app while `/dashboard/users`
 * maps to Administrator, even though the former is a prefix of the latter.
 */
export function areaKeyForPath(pathname) {
  let bestKey = null;
  let bestLen = -1;

  for (const area of AREAS) {
    for (const item of area.items) {
      const matches = item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(item.href + '/');

      // Longer href = more specific route, so it wins ties.
      if (matches && item.href.length > bestLen) {
        bestKey = area.key;
        bestLen = item.href.length;
      }
    }
  }

  return bestKey ?? 'dashboard';
}

/**
 * Filters the model down to what a given user may see.
 *
 * @param {(perm: string|null) => boolean} isVisible
 * @returns {Area[]}
 */
export function visibleAreasFor(isVisible) {
  return AREAS
    .map((area) => ({ ...area, items: area.items.filter((item) => isVisible(item.perm)) }))
    .filter((area) => area.items.length > 0);
}
