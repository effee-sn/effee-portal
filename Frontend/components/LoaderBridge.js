'use client';

import { useEffect } from 'react';
import { useTopLoader } from 'nextjs-toploader';
import { registerLoader } from '@/lib/topLoader';

/**
 * Wires the top progress bar's start/done (from useTopLoader) into the module
 * bridge so the API client can drive it. Renders nothing.
 */
export default function LoaderBridge() {
  const loader = useTopLoader();
  useEffect(() => {
    registerLoader({ start: () => loader.start(), done: () => loader.done() });
  }, [loader]);
  return null;
}
