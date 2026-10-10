const prisma = require('../../lib/prisma');
const { salesReports } = require('./sales.reports');
const { toXlsx, toCsv } = require('./report.export');
const { settingsService } = require('../settings/settings.service');
const { auditService } = require('../audit/audit.service');
const { NotFoundError, ForbiddenError } = require('../../core');

/**
 * Reports module (MIS). Groups report sets by business module; each module's
 * reports need that module's view permission on top of REPORT_VIEW (checked at
 * the route), so the Reports app never shows data a role can't otherwise see.
 *
 * Exports (Excel / CSV) are a separate permission (REPORT_EXPORT) and are
 * recorded in the audit log, since they take data out of the portal.
 */

const MODULES = Object.freeze({
  sales: { label: 'Sales', permission: 'SALES_VIEW', reports: salesReports },
});

const can = (actor, code) => Boolean(actor?.is_system || actor?.permissions?.includes(code));

function moduleFor(moduleKey, actor) {
  const mod = MODULES[moduleKey];
  if (!mod) throw new NotFoundError('Report module');
  if (!can(actor, mod.permission)) throw new ForbiddenError(`You don't have access to ${mod.label} data`);
  return mod;
}

/** Start of the Indian financial year (1 April) containing `d`. */
const fyStart = (d) => new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);

/** Request query → report filter. `to` becomes exclusive (the day after). */
function toFilter(q) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const to = q.to ? new Date(q.to) : new Date(today);
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + 1);
  const from = q.from ? new Date(q.from) : fyStart(today);
  from.setHours(0, 0, 0, 0);
  return {
    from, to,
    ownerId: q.owner_id, type: q.enquiry_type, applicationId: q.application_id,
    customerId: q.customer_id, stage: q.stage,
  };
}

const fmtDay = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Human summary of the filters, for the report header and export. */
async function describe(f) {
  const [owner, application, customer] = await Promise.all([
    f.ownerId ? prisma.user.findUnique({ where: { id: f.ownerId }, select: { name: true } }) : null,
    f.applicationId ? prisma.salesApplication.findUnique({ where: { id: f.applicationId }, select: { name: true } }) : null,
    f.customerId ? prisma.customer.findUnique({ where: { id: f.customerId }, select: { name: true } }) : null,
  ]);
  const parts = [`Period: ${fmtDay(f.from)} – ${fmtDay(new Date(f.to.getTime() - 1))}`];
  if (owner) parts.push(`Owner: ${owner.name}`);
  if (f.type) parts.push(`Type: ${f.type === 'GENERATED' ? 'Generated' : 'Incoming'}`);
  if (application) parts.push(`Application: ${application.name}`);
  if (customer) parts.push(`Customer: ${customer.name}`);
  if (f.stage) parts.push(`Stage: ${f.stage.replace(/_/g, ' ').toLowerCase()}`);
  return parts.join(' · ');
}

const reportsService = {
  /** Report sets the actor can open, with each report's title and description. */
  catalog(actor) {
    return Object.entries(MODULES)
      .filter(([, m]) => can(actor, m.permission))
      .map(([key, m]) => ({
        module: key,
        label: m.label,
        reports: m.reports.reports.map((r) => ({ key: r.key, title: r.title, description: r.description, filters: r.filters })),
      }));
  },

  /** Builds a report for on-screen viewing. */
  async run(moduleKey, reportKey, query, actor) {
    const report = moduleFor(moduleKey, actor).reports.find(reportKey);
    if (!report) throw new NotFoundError('Report');
    const f = toFilter(query);
    const [result, filters] = await Promise.all([report.build(f), describe(f)]);
    return {
      module: moduleKey,
      key: report.key,
      title: report.title,
      description: report.description,
      filters_supported: report.filters,
      filters,
      period: { from: f.from, to: new Date(f.to.getTime() - 1) },
      generated_at: new Date(),
      columns: report.columns,
      rows: result.rows,
      totals: result.totals ?? null,
      notes: result.notes ?? [],
    };
  },

  /**
   * Builds a report file.
   * @returns {Promise<{ buffer: Buffer, filename: string, contentType: string }>}
   */
  async export(moduleKey, reportKey, query, format, actor) {
    const built = await this.run(moduleKey, reportKey, query, actor);
    const settings = await settingsService.get(actor);
    const stamp = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    const day = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const base = `${moduleKey}-${reportKey}-${day(built.period.from)}-${day(built.period.to)}`;

    const file = format === 'csv'
      ? { buffer: toCsv(built), filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8' }
      : {
        buffer: toXlsx(built, { company: settings.company_name, filters: built.filters, generatedAt: stamp }),
        filename: `${base}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };

    await auditService.record({
      action: 'EXPORT',
      entity: 'Report',
      entityId: `${moduleKey}/${reportKey}`,
      actor,
      changes: { format, filters: built.filters, rows: built.rows.length },
    });
    return file;
  },
};

module.exports = { reportsService, toFilter };
