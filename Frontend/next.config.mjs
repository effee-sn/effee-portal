import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // BlockNote (and its Mantine deps) ship ESM that Next should transpile so the
  // resolution-plan editor bundles cleanly.
  transpilePackages: ['@blocknote/core', '@blocknote/react', '@blocknote/mantine'],
};

// Azure App Service (`npm run build:azure`): a self-contained server in
// .next/standalone with only the packages it needs — a small upload that starts
// fast. Off for the VPS, which keeps `next build` + `next start` under PM2.
if (process.env.NEXT_OUTPUT === 'standalone') {
  nextConfig.output = 'standalone';
  // This folder is the app; don't let Next look for a workspace above it.
  nextConfig.outputFileTracingRoot = path.dirname(fileURLToPath(import.meta.url));
}

export default nextConfig;
