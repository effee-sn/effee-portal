/**
 * Startup for Azure App Service (Startup Command: `node scripts/azure-start.js`).
 *
 * Applies pending database migrations, then starts the API. Migrations run
 * here rather than in the deploy pipeline because the database is reachable
 * only from inside the virtual network. `prisma migrate deploy` takes a lock,
 * so instances starting together don't apply a migration twice.
 *
 * Not used on the VPS (PM2 runs src/server.js; migrations are run by hand).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// A zip deploy can drop the executable bit; Prisma's engines need it.
const engines = path.join(root, 'node_modules', '@prisma', 'engines');
const client = path.join(root, 'node_modules', '.prisma', 'client');
for (const dir of [engines, client]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (/^(schema-engine|query-engine)/.test(f)) {
      try { fs.chmodSync(path.join(dir, f), 0o755); } catch { /* read-only: leave it */ }
    }
  }
}

const cli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const migrate = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { cwd: root, stdio: 'inherit' });
if (migrate.status !== 0) {
  console.error(`prisma migrate deploy failed (exit ${migrate.status}) — not starting the API`);
  process.exit(migrate.status || 1);
}

require('../src/server');
