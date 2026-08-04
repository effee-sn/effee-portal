'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import usePermissions from '@/lib/usePermissions';
import { apiGet } from '@/lib/api';
import { UPLOADS_URL } from '@/lib/config';
import { areaKeyForPath, visibleAreasFor } from '@/lib/navigation';

/** Multi-colour apps grid, the Odoo-style "switch app" affordance. */
function WaffleIcon() {
  const colors = ['#E74C3C', '#3498DB', '#F1C40F', '#2ECC71', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E', '#E91E63'];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <rect key={i} x={(i % 3) * 5.5} y={Math.floor(i / 3) * 5.5} width="4" height="4" rx="0.5" fill={colors[i]} />
      ))}
    </svg>
  );
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, can, loading: permLoading } = usePermissions();

  const [companyName, setCompanyName] = useState('Effee Portal');
  const [companyLogo, setCompanyLogo] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);     // mobile menu dropdown
  const [appsOpen, setAppsOpen] = useState(false);   // drawer mounted in the DOM
  const [appsShown, setAppsShown] = useState(false); // drawer transitioned into view
  const menuRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => {
    apiGet('/settings').then((s) => {
      if (s.company_name) setCompanyName(s.company_name);
      if (s.company_logo) setCompanyLogo(`${UPLOADS_URL}${s.company_logo}`);
    }).catch(() => {});
  }, []);

  // Close the user menu on any outside click. The app drawer manages its own
  // dismissal through its backdrop, so it is not handled here.
  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false);
      if (navRef.current && !navRef.current.contains(e.target)) setNavOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Close the app drawer and mobile menu whenever the route changes.
  useEffect(() => { setAppsOpen(false); setAppsShown(false); setNavOpen(false); }, [pathname]);

  const isVisible = (item) => {
    // System-only items (e.g. the audit log) are for super-admins regardless of
    // any permission code.
    if (item.system) return !!me?.is_system;
    if (!item.perm) return true;
    if (me?.is_system) return true;
    return can(item.perm);
  };

  // Areas the user may see. Recomputed when their permissions resolve.
  const visibleAreas = useMemo(
    () => visibleAreasFor(isVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me]
  );

  const activeKey  = areaKeyForPath(pathname);
  const activeArea = visibleAreas.find((a) => a.key === activeKey) ?? visibleAreas[0];

  const isActive = (href, exact) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
  const initials = me?.name ? me.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : '?';

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  // Mount, then transition in on the next frame so the CSS transition runs.
  const openApps  = () => { setAppsOpen(true); requestAnimationFrame(() => setAppsShown(true)); };
  // Transition out, then unmount after the animation completes.
  const closeApps = () => { setAppsShown(false); setTimeout(() => setAppsOpen(false), 200); };

  // Switching apps opens the target area's first permitted page.
  const switchArea = (area) => {
    closeApps();
    if (area.key !== activeArea?.key) router.push(area.items[0].href);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      <header className="flex items-center px-2 py-3 shrink-0 z-40 print:hidden" style={{ backgroundColor: '#1f2330' }}>
        {/* App switcher — opens the left drawer */}
        <div className="shrink-0">
          <button
            onClick={openApps}
            className="flex items-center gap-1.5 h-8 px-2 rounded transition hover:bg-white/10 cursor-pointer"
            aria-label="Switch application"
            aria-haspopup="dialog"
            aria-expanded={appsOpen}
          >
            <WaffleIcon />
            {activeArea && (
              <span className="hidden sm:block text-white text-sm font-medium whitespace-nowrap">{activeArea.label}</span>
            )}
            <svg className="w-3.5 h-3.5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2 mx-2 min-w-0 shrink-0">
          {/* Company logo (once uploaded) sits just before the company name. */}
          {companyLogo && (
            <img src={companyLogo} alt={companyName} className="h-6 w-auto max-w-[120px] object-contain shrink-0" />
          )}
          <span className="text-white font-semibold text-sm truncate max-w-36">{companyName}</span>
        </div>
        <div className="w-px h-5 bg-white/20 mr-2 shrink-0" />

        {/* Active area's menu — inline on md+, a dropdown on small screens */}
        {!permLoading && activeArea && (
          <div className="flex-1 min-w-0 flex items-center">
            {/* Desktop: inline items (scroll if they overflow) */}
            <nav className="hidden md:flex items-center gap-0.5 min-w-0 overflow-x-auto scrollbar-hide">
              {activeArea.items.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="shrink-0 px-3 py-1 rounded text-sm transition-colors whitespace-nowrap"
                    style={active
                      ? { backgroundColor: 'rgba(255,255,255,0.18)', color: '#fff', fontWeight: 500 }
                      : { color: 'rgba(255,255,255,0.65)' }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Mobile: a compact dropdown of the same items */}
            <div className="md:hidden relative min-w-0" ref={navRef}>
              <button
                onClick={() => setNavOpen((v) => !v)}
                className="flex items-center gap-1 h-8 px-2.5 rounded text-white text-sm max-w-full hover:bg-white/10 transition"
                aria-haspopup="menu"
                aria-expanded={navOpen}
              >
                <span className="truncate">
                  {activeArea.items.find((i) => isActive(i.href, i.exact))?.label || 'Menu'}
                </span>
                <svg className="w-3.5 h-3.5 text-white/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {navOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-56 max-w-[80vw] bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden py-1">
                  {activeArea.items.map((item) => {
                    const active = isActive(item.href, item.exact);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setNavOpen(false)}
                        className={`block px-4 py-2.5 text-sm transition-colors ${
                          active ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* User menu */}
        <div className="flex items-center gap-1 ml-2 shrink-0" ref={menuRef}>
          <span className="text-white/60 text-xs hidden lg:block px-1 max-w-32 truncate">{me?.name}</span>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold hover:ring-2 hover:ring-white/30 transition"
              style={{ backgroundColor: '#875A7B' }}
              aria-label="Open user menu"
            >
              {initials}
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-800 truncate">{me?.name}</p>
                  <p className="text-xs text-gray-400 truncate">{me?.email}</p>
                </div>
                <button onClick={handleLogout} className="w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition text-left">Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* App drawer — a left overlay panel for switching modules */}
      {appsOpen && (
        <div className="fixed inset-0 z-50 print:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            style={{ opacity: appsShown ? 1 : 0, transition: 'opacity .2s ease' }}
            onClick={closeApps}
            aria-hidden="true"
          />

          {/* Sliding panel */}
          <aside
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col"
            style={{
              transform: appsShown ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform .2s ease',
            }}
            role="dialog"
            aria-label="Applications"
          >
            <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-800">Applications</span>
              <button onClick={closeApps} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleAreas.map((area) => {
                const active = area.key === activeArea?.key;
                return (
                  <button
                    key={area.key}
                    onClick={() => switchArea(area)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                      active ? 'bg-gray-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ backgroundColor: active ? '#875A7B' : '#9aa0ac' }}
                    >
                      {area.label.charAt(0)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">{area.label}</span>
                      <span className="block text-xs text-gray-400 truncate">{area.subtitle}</span>
                    </span>
                    {active && (
                      <svg className="w-4 h-4 shrink-0" style={{ color: '#875A7B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto bg-white">{children}</main>
    </div>
  );
}
