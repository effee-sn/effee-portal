const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const config = require('../src/config/env');

const prisma = new PrismaClient();

/**
 * Database seeder — the single source of truth for baseline data.
 *
 * This replaces the previous split between `seed.js` and `seed.sql`, which
 * defined *different* role sets and, in the SQL case, created no user at all —
 * so the documented setup path produced a system nobody could log into.
 *
 * Properties this seeder is built to have:
 *
 *   - **Idempotent.** Safe to run repeatedly. Existing rows are updated rather
 *     than duplicated, so it doubles as a way to apply new permissions to an
 *     established database.
 *   - **Declarative.** Roles, modules, and permissions are data at the top of
 *     the file. Adding a module to the RBAC system is a few lines here, not a
 *     hand-written migration.
 *   - **Non-destructive.** Never deletes. Permission grants for known roles are
 *     reconciled, but custom roles created through the UI are left untouched.
 *
 * Run with: `npm run seed`
 */

// ─────────────────────────────────────────────────────────────────────────────
// Definitions — edit these to extend the RBAC model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roles created on every seed.
 *
 * `is_system` grants an unconditional bypass of all permission checks
 * (see middleware/authorize.js). Exactly one role should carry it.
 */
const ROLES = [
  { name: 'Super Admin', slug: 'super-admin', description: 'Full unrestricted system access', is_system: true },
  { name: 'Admin',       slug: 'admin',       description: 'Full access to all modules',      is_system: false },
  { name: 'Manager',     slug: 'manager',     description: 'Manages team members',            is_system: false },
  { name: 'Staff',       slug: 'staff',       description: 'Standard staff access',           is_system: false },
];

/** Functional areas that permissions attach to. */
const MODULES = [
  { name: 'USER',    slug: 'user',    description: 'User management' },
  { name: 'ROLE',    slug: 'role',    description: 'Roles & permissions' },
  { name: 'SERVICE',    slug: 'service',    description: 'Service desk tickets' },
  { name: 'FLOW',       slug: 'flow',       description: 'Workflow / flow builder' },
  { name: 'DEPARTMENT', slug: 'department', description: 'Departments' },
];

/** Default departments, so the user form's dropdown is not empty on first run. */
const DEPARTMENTS = [
  { name: 'Management' },
  { name: 'Engineering' },
  { name: 'Support' },
  { name: 'Sales' },
  { name: 'Operations' },
];

/**
 * Permissions, derived from modules and actions.
 *
 * Codes follow `<MODULE>_<ACTION>` and are what `authorize('USER_VIEW')` checks
 * in the routes. `action` must be a value of the Prisma `PermissionAction`
 * enum — the schema constrains it to one row per module/action pair.
 */
const PERMISSIONS = [
  { module: 'user', action: 'VIEW',   code: 'USER_VIEW'   },
  { module: 'user', action: 'CREATE', code: 'USER_CREATE' },
  { module: 'user', action: 'EDIT',   code: 'USER_EDIT'   },
  { module: 'user', action: 'DELETE', code: 'USER_DELETE' },
  { module: 'role', action: 'VIEW',   code: 'ROLE_VIEW'   },
  { module: 'role', action: 'CREATE', code: 'ROLE_CREATE' },
  { module: 'role', action: 'EDIT',   code: 'ROLE_EDIT'   },
  { module: 'role', action: 'DELETE', code: 'ROLE_DELETE' },

  // Service area — service-desk tickets.
  { module: 'service', action: 'VIEW',   code: 'SERVICE_VIEW' },
  { module: 'service', action: 'CREATE', code: 'SERVICE_CREATE' },
  { module: 'service', action: 'EDIT',   code: 'SERVICE_EDIT' },
  { module: 'service', action: 'DELETE', code: 'SERVICE_DELETE' },

  // Flow builder — administrator tool for defining workflows.
  { module: 'flow', action: 'VIEW',   code: 'FLOW_VIEW' },
  { module: 'flow', action: 'CREATE', code: 'FLOW_CREATE' },
  { module: 'flow', action: 'EDIT',   code: 'FLOW_EDIT' },
  { module: 'flow', action: 'DELETE', code: 'FLOW_DELETE' },

  // Departments.
  { module: 'department', action: 'VIEW',   code: 'DEPT_VIEW' },
  { module: 'department', action: 'CREATE', code: 'DEPT_CREATE' },
  { module: 'department', action: 'EDIT',   code: 'DEPT_EDIT' },
  { module: 'department', action: 'DELETE', code: 'DEPT_DELETE' },
];

/**
 * Which permission codes each seeded role is granted.
 *
 * A predicate rather than a list so blanket grants stay readable and new
 * permissions are picked up automatically. Roles absent from this map are
 * ignored entirely, which is what protects roles created through the UI.
 *
 * @type {Record<string, (code: string) => boolean>}
 */
const ROLE_GRANTS = {
  'super-admin': () => true,
  'admin':       () => true,
  'manager':     (code) => ['USER_VIEW', 'USER_CREATE', 'USER_EDIT', 'ROLE_VIEW'].includes(code),
  'staff':       (code) => ['USER_VIEW'].includes(code),
};

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap administrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the Super Admin bootstrap credentials.
 *
 * The original seeder hardcoded `admin@admin.com` / `123456`. A known
 * credential on an `is_system` role is a full system compromise the moment the
 * host is reachable, and seeds have a habit of being run against environments
 * they were never meant for.
 *
 *   - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` are used when supplied.
 *   - Otherwise a random password is generated and printed once.
 *   - In production a password must be supplied explicitly; the seeder refuses
 *     to invent one, because an unread console line is not a credential
 *     handover.
 *
 * @returns {{ email: string, password: string, generated: boolean }}
 */
function resolveAdminCredentials() {
  const email    = (process.env.SEED_ADMIN_EMAIL || 'admin@admin.com').trim().toLowerCase();
  const supplied = process.env.SEED_ADMIN_PASSWORD;

  if (supplied && supplied.trim()) {
    return { email, password: supplied.trim(), generated: false };
  }

  if (config.IS_PRODUCTION) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set when seeding a production environment. ' +
      'Refusing to create a Super Admin with a generated password that may go unread.'
    );
  }

  return { email, password: crypto.randomBytes(18).toString('base64url'), generated: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeding steps
// ─────────────────────────────────────────────────────────────────────────────

/** @returns {Promise<Map<string, { id: number }>>} slug → role */
async function seedRoles() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where:  { slug: role.slug },
      // `name` and `description` are refreshed so edits to this file propagate,
      // but `is_system` is deliberately not downgraded on an existing role.
      update: { name: role.name, description: role.description },
      create: role,
    });
  }

  const roles = await prisma.role.findMany({ select: { id: true, slug: true } });
  console.log(`  roles         ${ROLES.length} defined, ${roles.length} total in database`);
  return new Map(roles.map((r) => [r.slug, r]));
}

/** @returns {Promise<Map<string, { id: number }>>} slug → module */
async function seedModules() {
  for (const mod of MODULES) {
    await prisma.module.upsert({
      where:  { slug: mod.slug },
      update: { name: mod.name, description: mod.description },
      create: mod,
    });
  }

  const modules = await prisma.module.findMany({ select: { id: true, slug: true } });
  console.log(`  modules       ${MODULES.length} defined`);
  return new Map(modules.map((m) => [m.slug, m]));
}

/**
 * @param {Map<string, { id: number }>} moduleBySlug
 * @returns {Promise<Array<{ id: number, code: string }>>}
 */
async function seedPermissions(moduleBySlug) {
  for (const perm of PERMISSIONS) {
    const mod = moduleBySlug.get(perm.module);
    if (!mod) throw new Error(`Permission "${perm.code}" references unknown module "${perm.module}"`);

    await prisma.permission.upsert({
      where:  { code: perm.code },
      update: {},
      create: { module_id: mod.id, action: perm.action, code: perm.code },
    });
  }

  const permissions = await prisma.permission.findMany({ select: { id: true, code: true } });
  console.log(`  permissions   ${PERMISSIONS.length} defined`);
  return permissions;
}

/**
 * Reconciles role-permission grants.
 *
 * Runs inside a transaction so a failure part-way cannot leave a role holding a
 * partially applied permission set — which for an authorisation table means
 * silently wrong access until someone notices.
 *
 * @param {Map<string, { id: number }>} roleBySlug
 * @param {Array<{ id: number, code: string }>} permissions
 */
async function seedRolePermissions(roleBySlug, permissions) {
  /** @type {import('@prisma/client').Prisma.PrismaPromise<unknown>[]} */
  const operations = [];
  let granted = 0;

  for (const [slug, isAllowed] of Object.entries(ROLE_GRANTS)) {
    const role = roleBySlug.get(slug);
    if (!role) continue;

    for (const permission of permissions) {
      const allowed = isAllowed(permission.code);
      if (allowed) granted += 1;

      operations.push(prisma.rolePermission.upsert({
        where:  { role_id_permission_id: { role_id: role.id, permission_id: permission.id } },
        update: { allowed },
        create: { role_id: role.id, permission_id: permission.id, allowed },
      }));
    }
  }

  await prisma.$transaction(operations);
  console.log(`  grants        ${operations.length} reconciled, ${granted} allowed`);
}

/**
 * Creates the bootstrap administrator if no user holds a system role yet.
 *
 * Gated on the *role* rather than the email so that renaming the admin account
 * does not cause a second one to be created on the next seed.
 *
 * @param {Map<string, { id: number }>} roleBySlug
 */
async function seedSuperAdmin(roleBySlug) {
  const superAdminRole = roleBySlug.get('super-admin');
  if (!superAdminRole) throw new Error('super-admin role is missing — cannot create bootstrap user');

  const existing = await prisma.user.count({ where: { role: { is_system: true } } });
  if (existing > 0) {
    console.log(`  super admin   already present (${existing}), skipping`);
    return;
  }

  const admin = resolveAdminCredentials();
  const password = await bcrypt.hash(admin.password, config.BCRYPT_ROUNDS);

  await prisma.user.create({
    data: {
      name:        'Super Admin',
      email:       admin.email,
      phone:       process.env.SEED_ADMIN_PHONE || '9000000000',
      password,
      role_id:     superAdminRole.id,
      is_verified: true,
      status:      'ACTIVE',
    },
  });

  console.log(`  super admin   created → ${admin.email}`);

  if (admin.generated) {
    console.log('');
    console.log('  ┌──────────────────────────────────────────────────────────┐');
    console.log('  │  GENERATED PASSWORD — shown once, stored nowhere else    │');
    console.log('  ├──────────────────────────────────────────────────────────┤');
    console.log(`  │  ${admin.password.padEnd(54)}  │`);
    console.log('  └──────────────────────────────────────────────────────────┘');
    console.log('  Record it now, then change it after first login.');
    console.log('');
  }
}

/** Ensures the singleton settings row exists so the app never has to create it. */
async function seedCompanySettings() {
  const existing = await prisma.companySettings.findFirst({ select: { id: true } });
  if (existing) {
    console.log('  settings      already present, skipping');
    return;
  }

  await prisma.companySettings.create({ data: {} });
  console.log('  settings      created with defaults');
}

/** Creates the default departments, skipping any that already exist by name. */
async function seedDepartments() {
  for (const dept of DEPARTMENTS) {
    await prisma.department.upsert({
      where:  { name: dept.name },
      update: {},
      create: dept,
    });
  }
  const total = await prisma.department.count();
  console.log(`  departments   ${DEPARTMENTS.length} defined, ${total} total in database`);
}

async function main() {
  console.log('\nSeeding database…\n');

  const roleBySlug   = await seedRoles();
  const moduleBySlug = await seedModules();
  const permissions  = await seedPermissions(moduleBySlug);

  await seedRolePermissions(roleBySlug, permissions);
  await seedDepartments();
  await seedCompanySettings();
  await seedSuperAdmin(roleBySlug);

  console.log('\nSeeding complete.\n');
}

main()
  .catch((err) => {
    console.error('\nSeeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
