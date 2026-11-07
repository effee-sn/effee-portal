const prisma = require('../../lib/prisma');

/**
 * Issue data-access layer.
 *
 * @param {import('@prisma/client').PrismaClient} db
 */
function createIssueRepository(db) {
  const person = { select: { id: true, name: true } };

  const listSelect = Object.freeze({
    id: true, ref_no: true, type: true, priority: true, status: true, title: true, due_date: true,
    module: true, entity_type: true, entity_id: true, entity_label: true,
    raised_by_id: true, raised_by: person,
    assignee_id: true, assignee: person,
    department_id: true, department: { select: { id: true, name: true, head_user_id: true } },
    reopened_count: true, resolved_at: true, closed_at: true, created_at: true, updated_at: true,
    _count: { select: { comments: { where: { kind: 'COMMENT' } }, files: true } },
  });

  const detailSelect = Object.freeze({
    ...listSelect,
    description: true, page_url: true, resolution: true, assigned_at: true,
    department: { select: { id: true, name: true, head_user_id: true, head: person } },
    watchers: { select: { user_id: true, user: person }, orderBy: { created_at: 'asc' } },
    files: {
      where: { comment_id: null },
      select: { id: true, file_name: true, mime_type: true, size_bytes: true, created_by: true, created_at: true },
      orderBy: { id: 'asc' },
    },
    comments: {
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        id: true, kind: true, body: true, created_at: true, author_id: true, author: person,
        files: { select: { id: true, file_name: true, mime_type: true, size_bytes: true }, orderBy: { id: 'asc' } },
      },
    },
  });

  return {
    listSelect,
    detailSelect,

    async findPage({ where, orderBy, skip, take }) {
      const [items, total] = await Promise.all([
        db.issue.findMany({ where, select: listSelect, orderBy, skip, take }),
        db.issue.count({ where }),
      ]);
      return { items, total };
    },

    count(where) {
      return db.issue.count({ where });
    },

    /** @param {number} id */
    findById(id) {
      return db.issue.findUnique({ where: { id }, select: detailSelect });
    },

    /** Just what the rules need. @param {number} id */
    findCore(id) {
      return db.issue.findUnique({
        where: { id },
        select: {
          id: true, ref_no: true, title: true, status: true, type: true,
          raised_by_id: true, assignee_id: true, department_id: true, reopened_count: true,
          department: { select: { id: true, name: true, head_user_id: true } },
          watchers: { select: { user_id: true } },
        },
      });
    },

    async maxRefForPrefix(prefix) {
      const row = await db.issue.findFirst({ where: { ref_no: { startsWith: prefix } }, orderBy: { ref_no: 'desc' }, select: { ref_no: true } });
      return row?.ref_no ?? null;
    },

    /**
     * Creates the issue with its watchers and files in one transaction.
     * @param {object} data @param {number[]} watcherIds @param {object[]} files
     */
    create(data, watcherIds, files) {
      return db.$transaction(async (tx) => {
        const issue = await tx.issue.create({ data, select: { id: true } });
        if (watcherIds.length) {
          await tx.issueWatcher.createMany({ data: watcherIds.map((user_id) => ({ issue_id: issue.id, user_id })), skipDuplicates: true });
        }
        if (files.length) await tx.issueFile.createMany({ data: files.map((f) => ({ ...f, issue_id: issue.id })) });
        return issue;
      });
    },

    update(id, data) {
      return db.issue.update({ where: { id }, data, select: { id: true } });
    },

    /**
     * Adds an entry to the conversation (a reply, or an event), with its files.
     * @param {{ issue_id: number, author_id: number|null, kind: string, body: string }} data
     * @param {object[]} [files]
     */
    addComment(data, files = []) {
      return db.$transaction(async (tx) => {
        const comment = await tx.issueComment.create({ data, select: { id: true } });
        if (files.length) {
          await tx.issueFile.createMany({ data: files.map((f) => ({ ...f, issue_id: data.issue_id, comment_id: comment.id })) });
        }
        // The issue moved: its list position follows.
        await tx.issue.update({ where: { id: data.issue_id }, data: { updated_at: new Date() } });
        return comment;
      });
    },

    addWatcher(issueId, userId) {
      return db.issueWatcher.upsert({
        where: { issue_id_user_id: { issue_id: issueId, user_id: userId } },
        create: { issue_id: issueId, user_id: userId },
        update: {},
      });
    },

    removeWatcher(issueId, userId) {
      return db.issueWatcher.deleteMany({ where: { issue_id: issueId, user_id: userId } });
    },

    findFile(id) {
      return db.issueFile.findUnique({ where: { id }, select: { id: true, issue_id: true, file_name: true, stored_name: true, mime_type: true } });
    },

    /** Active users, by id. @param {number[]} ids */
    activeUsers(ids) {
      if (!ids.length) return Promise.resolve([]);
      return db.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE', deleted_at: null }, select: { id: true, name: true, department_id: true } });
    },

    department(id) {
      return db.department.findFirst({ where: { id, deleted_at: null }, select: { id: true, name: true, head_user_id: true } });
    },

    /** Who an issue can go to: active people, and departments with their head. */
    async targets() {
      const [users, departments] = await Promise.all([
        db.user.findMany({
          where: { status: 'ACTIVE', deleted_at: null },
          select: { id: true, name: true, department_id: true, department: { select: { name: true } } },
          orderBy: { name: 'asc' },
        }),
        db.department.findMany({
          where: { deleted_at: null },
          select: { id: true, name: true, head_user_id: true, head: { select: { id: true, name: true, status: true, deleted_at: true } } },
          orderBy: { name: 'asc' },
        }),
      ]);
      return {
        users: users.map((u) => ({ id: u.id, name: u.name, department_id: u.department_id, department: u.department?.name ?? null })),
        departments: departments.map((d) => ({
          id: d.id, name: d.name,
          head: d.head && d.head.status === 'ACTIVE' && !d.head.deleted_at ? { id: d.head.id, name: d.head.name } : null,
        })),
      };
    },

    /** The portal's administrator for Portal bugs: the first active Super Admin. */
    firstSystemUser() {
      return db.user.findFirst({
        where: { status: 'ACTIVE', deleted_at: null, role: { is_system: true } },
        orderBy: { id: 'asc' },
        select: { id: true, name: true },
      });
    },

    /** Departments this user heads. @param {number} userId */
    async headedDepartmentIds(userId) {
      if (!userId) return [];
      const rows = await db.department.findMany({ where: { head_user_id: userId, deleted_at: null }, select: { id: true } });
      return rows.map((r) => r.id);
    },
  };
}

const issueRepository = createIssueRepository(prisma);

module.exports = { issueRepository, createIssueRepository };
