'use client';

import { useRouter } from 'next/navigation';
import { useTopLoader } from 'nextjs-toploader';

/**
 * Navigate programmatically WITH the top progress bar — the feedback a plain
 * <Link> click gives but `router.push` does not (nextjs-toploader only starts
 * the bar on anchor clicks). Use this for row clicks and any onClick that
 * navigates, so the user always sees something is happening.
 *
 * The bar is started here (like an anchor click) and nextjs-toploader completes
 * it when the navigation's history push fires; the destination page's data load
 * then drives the bar again through the API client.
 *
 * @returns {(href: string) => void}
 */
export default function useNav() {
  const router = useRouter();
  const loader = useTopLoader();
  return (href) => {
    loader.start();
    router.push(href);
  };
}
