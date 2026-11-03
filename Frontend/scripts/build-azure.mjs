/**
 * Builds the frontend for Azure App Service: `next build` in standalone mode,
 * then copies in what the standalone server doesn't carry itself (public/ and
 * the static assets). The result, .next/standalone, is the whole app — deploy
 * that folder and start it with `node start.js`.
 *
 * NEXT_PUBLIC_API_URL and NEXT_PUBLIC_UPLOADS_URL are baked in at build time,
 * so set them (to the Azure API's address) before running this.
 *
 * Usage: npm run build:azure
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, '.next', 'standalone');

for (const name of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_UPLOADS_URL']) {
  if (!process.env[name]) console.warn(`! ${name} is not set — the build will point at localhost`);
}

fs.rmSync(out, { recursive: true, force: true });
const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const build = spawnSync(process.execPath, [next, 'build'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_OUTPUT: 'standalone' },
});
if (build.status !== 0) process.exit(build.status ?? 1);

fs.cpSync(path.join(root, 'public'), path.join(out, 'public'), { recursive: true });
fs.cpSync(path.join(root, '.next', 'static'), path.join(out, '.next', 'static'), { recursive: true });
// App Service sets HOSTNAME to the container's name, and the standalone server
// would listen on that alone — out of reach of the platform's front end.
fs.writeFileSync(path.join(out, 'start.js'),
  "// Azure App Service start: listen on all interfaces, then run Next's server.\n"
  + "process.env.HOSTNAME = '0.0.0.0';\nrequire('./server.js');\n");
console.log(`\nAzure build ready: ${path.relative(root, out)} (start with: node start.js)`);
