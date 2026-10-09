'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTopLoader } from 'nextjs-toploader';

/**
 * Navigate programmatically WITH the top progress bar — the feedback a plain
 * <Link> click gives but `router.push` does not (nextjs-toploader only starts
 * the bar on anchor clicks). Use this for row clicks and any onClick that
 * navigates, so the user always sees something is happening.
 *
 * The bar is started here (like an anchor click) and nextjs-toploader completes
 * it when the navigation's history push / replace / popstate fires; the
 * destination page's data load then drives the bar again through the API client.
 *
 * Navigating to the page you are already on starts nothing, so the bar can't
 * hang waiting for a navigation that never happens.
 *
 *   const nav = useNav();
 *   nav('/dashboard/x');          // push
 *   nav.replace('/dashboard/x');  // replace
 *   nav.back();                   // history back
 *
 * @returns {((href: string) => void) & { replace: (href: string, opts?: object) => void, back: () => void }}
 */
export default function useNav() {
  const router = useRouter();
  const pathname = usePathname();
  const loader = useTopLoader();

  const begin = (href) => {
    const target = href.split(/[?#]/)[0];
    if (target !== pathname || href !== target) loader.start();
  };

  return Object.assign((href) => { begin(href); router.push(href); }, {
    replace: (href, opts) => { begin(href); router.replace(href, opts); },
    // A fresh tab has nowhere to go back to — don't start a bar nothing will finish.
    back: () => { if (window.history.length > 1) loader.start(); router.back(); },
  });
}
