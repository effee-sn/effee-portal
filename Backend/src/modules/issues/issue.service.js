const fs = require('fs');

const { issueRepository } = require('./issue.repository');
const { fileKey } = require('./issue.upload');
const fileStore = require('../../lib/fileStore');
const { auditService } = require('../audit/audit.service');
const { notificationService } = require('../notification/notification.service');
const {
  NotFoundError, ConflictError, ValidationError, ForbiddenError, buildSearchClause,
} = require('../../core');

/**
 * Issues — the issue logger.
 *
 * Anyone raises an issue (a question, a request, a problem, a portal bug) from
 * wherever they are working; the record they were on comes with it. Rules:
 *
 *   - **One owner at a time.** It is with one person, or waiting in one
 *     department's queue (no person yet) for the department head to assign —
 *     never with "everyone".
 *   - **Who sees it:** whoever raised it, whoever it is with, the people
 *     watching it, and the head of its department. Issues → View sees all.
 *   - **Moving it** (to a person or a department): whoever raised it, whoever
 *     it is with, or the department head, while it is open.
 *   - **Working it:** whoever it is with starts it and resolves it (saying how).
 *   - **Closing it:** only whoever raised it — they confirm the resolution and
 *     close it, or reopen it saying why. They may also cancel it while open.
 *   - **Issues → Edit** (and Super Admins) may do any of this on any issue.
 *   - A Portal bug with nobody chosen goes to the portal's administrator.
 */

const TYPE_LABEL = Object.freeze({ QUESTION: 'Question', REQUEST: 'Request', PROBLEM: 'Problem', BUG: 'Portal bug' });
const PRIORITY_LABEL = Object.freeze({ LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', URGENT: 'Urgent' });
const OPEN = Object.freeze(['OPEN', 'IN_PROGRESS']);
const STATUS_FILTER = Object.freeze({
  open: { in: [...OPEN] },
  resolved: 'RESOLVED',
  done: { in: ['CLOSED', 'CANCELLED'] },
});

const seesAll = (actor) => Boolean(actor?.is_system || actor?.permissions?.includes('ISSUE_VIEW'));
const managesAll = (actor) => Boolean(actor?.is_system || actor?.permissions?.includes('ISSUE_EDIT'));
const isRaiser = (issue, actor) => Boolean(actor?.id) && issue.raised_by_id === actor.id;
const isAssignee = (issue, actor) => Boolean(actor?.id) && issue.assignee_id === actor.id;
const isHead = (issue, actor) => Boolean(actor?.id) && issue.department?.head_user_id === actor.id;
const isWatcher = (issue, actor) => Boolean(actor?.id) && (issue.watchers || []).some((w) => w.user_id === actor.id);

/** What this person may do on the issue — the API's rules, for the page to show. */
function permissionsFor(issue, actor) {
  const manage = managesAll(actor);
  const raiser = isRaiser(issue, actor);
  const open = OPEN.includes(issue.status);
  return {
    comment: !['CLOSED', 'CANCELLED'].includes(issue.status),
    assign: open && (manage || raiser || isAssignee(issue, actor) || isHead(issue, actor)),
    start: issue.status === 'OPEN' && Boolean(issue.assignee_id) && (isAssignee(issue, actor) || manage),
    resolve: open && Boolean(issue.assignee_id) && (isAssignee(issue, actor) || manage),
    close: issue.status === 'RESOLVED' && (raiser || manage),
    reopen: ['RESOLVED', 'CLOSED'].includes(issue.status) && (raiser || manage),
    cancel: open && (raiser || manage),
    edit: open && (raiser || manage),
    take: open && !issue.assignee_id && isHead(issue, actor),
  };
}

/**
 * @param {ReturnType<typeof import('./issue.repository').createIssueRepository>} repository
 */
function createIssueService(repository) {
  const SORTABLE_FIELDS = Object.freeze(['updated_at', 'created_at', 'due_date', 'ref_no', 'priority', 'status']);
  const link = (id) => `/dashboard/issues?open=${id}`;

  /** Who can see it — the Prisma `where` for someone without Issues → View. */
  function visibleTo(actor) {
    return {
      OR: [
        { raised_by_id: actor.id },
        { assignee_id: actor.id },
        { watchers: { some: { user_id: actor.id } } },
        { department: { head_user_id: actor.id } },
      ],
    };
  }

  async function load(id, actor) {
    const issue = await repository.findCore(id);
    if (!issue) throw new NotFoundError('Issue');
    if (!(seesAll(actor) || isRaiser(issue, actor) || isAssignee(issue, actor) || isWatcher(issue, actor) || isHead(issue, actor))) {
      throw new NotFoundError('Issue'); // someone else's issue reads as not found
    }
    return issue;
  }

  function assertMay(issue, actor, action, message) {
    if (!permissionsFor(issue, actor)[action]) throw new ForbiddenError(message);
  }

  /** Next `ISS-YYYY-NNNN`. */
  async function nextRef() {
    const prefix = `ISS-${new Date().getFullYear()}-`;
    const latest = await repository.maxRefForPrefix(prefix);
    const seq = latest ? Number(latest.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  const discard = (files) => { for (const f of files || []) if (f?.path) fs.promises.unlink(f.path).catch(() => {}); };

  /** Moves the uploaded files to their store (Azure Blob when on) and returns the rows to record. */
  async function storeFiles(files, actor) {
    const rows = [];
    try {
      for (const f of files || []) {
        await fileStore.saveFile(fileKey(f.filename), f.path, f.mimetype);
        rows.push({ file_name: f.originalname.slice(0, 255), stored_name: f.filename, mime_type: f.mimetype, size_bytes: f.size, created_by: actor?.id ?? null });
      }
    } catch (err) {
      discard(files);
      throw err;
    }
    return rows;
  }

  /**
   * Resolves "to a person or a department" into the columns to store.
   * @returns {Promise<{ assignee_id: number|null, department_id: number|null, label: string, notifyId: number|null }>}
   */
  async function resolveTarget({ assignee_id, department_id }, current = null) {
    if (assignee_id) {
      const [user] = await repository.activeUsers([assignee_id]);
      if (!user) throw new ValidationError('Validation failed', [{ field: 'assignee_id', message: 'Choose an active person' }]);
      // Handed to someone in its department (or its head): it stays the department's.
      const dept = current?.department;
      const keepDept = dept && (user.department_id === dept.id || dept.head_user_id === user.id);
      return { assignee_id: user.id, department_id: keepDept ? dept.id : null, label: user.name, notifyId: user.id };
    }
    const dept = await repository.department(department_id);
    if (!dept) throw new ValidationError('Validation failed', [{ field: 'department_id', message: 'Choose a department' }]);
    if (!dept.head_user_id) {
      throw new ValidationError('Validation failed', [{ field: 'department_id', message: `${dept.name} has no department head to assign it — choose a person` }]);
    }
    return { assignee_id: null, department_id: dept.id, label: `${dept.name} (waiting for the department head to assign)`, notifyId: dept.head_user_id };
  }

  /** Everyone involved now: raiser, owner (or the head while it waits in the queue), watchers. */
  function participants(issue) {
    return [
      issue.raised_by_id,
      issue.assignee_id,
      !issue.assignee_id ? issue.department?.head_user_id : null,
      ...(issue.watchers || []).map((w) => w.user_id),
    ].filter(Boolean);
  }

  function notify(issue, userIds, actor, { type, title, body, intro }) {
    // Awaited by callers: the notification is written before the request answers (notify never throws).
    return notificationService.notify({
      userIds,
      type,
      title: `${title}: ${issue.ref_no}`,
      body: `${issue.title}${body ? ` — ${body}` : ''}`,
      entityType: 'Issue',
      entityId: String(issue.id),
      link: link(issue.id),
      actorId: actor?.id ?? null,
      email: intro ? { eyebrow: 'Issues', intro } : undefined,
    });
  }

  const event = (issue, actor, body) => repository.addComment({ issue_id: issue.id, author_id: actor?.id ?? null, kind: 'EVENT', body });

  async function detail(id, actor) {
    const issue = await repository.findById(id);
    return { ...issue, can: permissionsFor(issue, actor), watching: isWatcher(issue, actor) };
  }

  return {
    SORTABLE_FIELDS,
    permissionsFor,

    /** People and departments an issue can go to. */
    targets() {
      return repository.targets();
    },

    /** The counts behind the floating button's badge. @param {object} actor */
    async summary(actor) {
      const heads = await repository.headedDepartmentIds(actor.id);
      const [assigned, queue, toConfirm] = await Promise.all([
        repository.count({ assignee_id: actor.id, status: { in: [...OPEN] } }),
        heads.length ? repository.count({ assignee_id: null, department_id: { in: heads }, status: { in: [...OPEN] } }) : 0,
        repository.count({ raised_by_id: actor.id, status: 'RESOLVED' }),
      ]);
      return { assigned, queue, to_confirm: toConfirm, total: assigned + queue + toConfirm, heads_department: heads.length > 0 };
    },

    /**
     * A tab of issues: assigned to me, raised by me, watching, my department's
     * queue, all (Issues → View) or one record's (the ones I can see).
     */
    async list(query, actor) {
      const tab = query.tab || 'assigned';
      const and = [];
      if (tab === 'assigned') and.push({ assignee_id: actor.id });
      else if (tab === 'raised') and.push({ raised_by_id: actor.id });
      else if (tab === 'watching') and.push({ watchers: { some: { user_id: actor.id } } });
      else if (tab === 'queue') {
        const heads = actor.is_system ? null : await repository.headedDepartmentIds(actor.id);
        if (heads && !heads.length) return { items: [], total: 0 };
        and.push({ assignee_id: null, department_id: heads ? { in: heads } : { not: null } });
      } else if (tab === 'all') {
        if (!seesAll(actor)) throw new ForbiddenError('You need Issues → View to see everyone’s issues');
      } else if (tab === 'record') {
        if (!query.entity_type || !query.entity_id) throw new ValidationError('Validation failed', [{ field: 'entity_id', message: 'Which record?' }]);
        and.push({ entity_type: query.entity_type, entity_id: String(query.entity_id) });
        if (!seesAll(actor)) and.push(visibleTo(actor));
      }
      if (query.status) and.push({ status: STATUS_FILTER[query.status] ?? query.status });
      if (query.type) and.push({ type: query.type });
      if (query.module) and.push({ module: query.module });
      const search = buildSearchClause(query.search, ['ref_no', 'title']);
      if (search) and.push(search);

      const [[field, dir] = ['updated_at', 'desc']] = Object.entries(query.orderBy || {});
      const page = await repository.findPage({ where: { AND: and }, orderBy: [{ [field]: dir }, { id: 'desc' }], skip: query.skip, take: query.take });
      return { ...page, items: page.items.map((i) => ({ ...i, can: permissionsFor(i, actor) })) };
    },

    /** @param {number} id @param {object} actor */
    async getById(id, actor) {
      await load(id, actor);
      return detail(id, actor);
    },

    /**
     * Raises an issue, to a person or a department (a Portal bug may leave both
     * empty: it goes to the portal's administrator).
     */
    async create(dto, files, actor) {
      let target;
      try {
        if (!dto.assignee_id && !dto.department_id) {
          if (dto.type !== 'BUG') {
            throw new ValidationError('Validation failed', [{ field: 'assignee_id', message: 'Choose who it is for — a person or a department' }]);
          }
          const admin = await repository.firstSystemUser();
          if (!admin) throw new ValidationError('Validation failed', [{ field: 'assignee_id', message: 'Choose who it is for' }]);
          dto = { ...dto, assignee_id: admin.id };
        }
        target = await resolveTarget(dto);
        if (target.assignee_id === actor.id) {
          throw new ValidationError('Validation failed', [{ field: 'assignee_id', message: 'Raise it for someone else' }]);
        }
      } catch (err) { discard(files); throw err; }

      const fileRows = await storeFiles(files, actor);
      const watchers = (await repository.activeUsers(dto.watcher_ids || []))
        .map((u) => u.id).filter((uid) => uid !== actor.id && uid !== target.assignee_id);

      let created;
      for (let attempt = 0; ; attempt += 1) {
        try {
          created = await repository.create({
            ref_no: await nextRef(),
            type: dto.type,
            priority: dto.priority || 'NORMAL',
            title: dto.title,
            description: dto.description,
            due_date: dto.due_date ?? null,
            module: dto.module ?? null,
            entity_type: dto.entity_type ?? null,
            entity_id: dto.entity_id ?? null,
            entity_label: dto.entity_label ?? null,
            page_url: dto.page_url ?? null,
            raised_by_id: actor.id,
            assignee_id: target.assignee_id,
            department_id: target.department_id,
            assigned_at: new Date(),
          }, watchers, fileRows);
          break;
        } catch (err) {
          if (err?.code === 'P2002' && attempt < 2) continue; // two raised at once took the same number
          throw err;
        }
      }

      const issue = await repository.findCore(created.id);
      await auditService.record({
        action: auditService.Action.CREATE, entity: 'Issue', entityId: issue.id, actor,
        changes: { ref_no: issue.ref_no, type: dto.type, to: target.label, about: dto.entity_label ?? null },
      });
      const about = dto.entity_label ? ` (about ${dto.entity_label})` : '';
      await notify(issue, [target.notifyId], actor, {
        type: notificationService.Type.ISSUE_ASSIGNED,
        title: target.assignee_id ? `${TYPE_LABEL[dto.type]} for you` : `${TYPE_LABEL[dto.type]} for ${target.label.split(' (')[0]} — assign it`,
        body: `from ${actor.name || 'a colleague'}${about}`,
        intro: target.assignee_id
          ? `${actor.name || 'A colleague'} raised an issue for you${about}.`
          : `${actor.name || 'A colleague'} raised an issue for your department${about}. As its head, assign it to someone in the team (or take it).`,
      });
      if (watchers.length) {
        await notify(issue, watchers, actor, { type: notificationService.Type.ISSUE_COMMENT, title: 'You were added to an issue', body: `raised by ${actor.name || 'a colleague'}` });
      }
      return detail(issue.id, actor);
    },

    /** Changes the title, description, priority or due date (whoever raised it, while open). */
    async update(id, dto, actor) {
      const issue = await load(id, actor);
      assertMay(issue, actor, 'edit', 'Only the person who raised it can change it, while it is open');
      const before = await repository.findById(id);
      const data = {};
      for (const f of ['title', 'description', 'priority']) if (dto[f] !== undefined && dto[f] !== before[f]) data[f] = dto[f];
      if (dto.due_date !== undefined) {
        const was = before.due_date ? before.due_date.toISOString().slice(0, 10) : null;
        const now = dto.due_date ? dto.due_date.toISOString().slice(0, 10) : null;
        if (was !== now) data.due_date = dto.due_date;
      }
      if (!Object.keys(data).length) return detail(id, actor);
      await repository.update(id, data);
      const notes = [];
      if (data.priority) notes.push(`Priority set to ${PRIORITY_LABEL[data.priority]}`);
      if (data.due_date !== undefined) notes.push(data.due_date ? `Due date set to ${data.due_date.toISOString().slice(0, 10)}` : 'Due date removed');
      if (data.title || data.description) notes.push('Details edited');
      await event(issue, actor, notes.join(' · '));
      return detail(id, actor);
    },

    /** A reply in the conversation, with files; everyone involved is told. */
    async comment(id, dto, files, actor) {
      let issue;
      try {
        issue = await load(id, actor);
        assertMay(issue, actor, 'comment', 'This issue is closed — reopen it to continue');
        if (!dto.body && !(files || []).length) throw new ValidationError('Validation failed', [{ field: 'body', message: 'Write a reply or attach a file' }]);
      } catch (err) { discard(files); throw err; }
      const fileRows = await storeFiles(files, actor);
      await repository.addComment({ issue_id: id, author_id: actor.id, kind: 'COMMENT', body: dto.body || '' }, fileRows);
      // Replying to someone else's issue as an outsider (Issues → View): keep them informed from now on.
      if (!participants(issue).includes(actor.id)) await repository.addWatcher(id, actor.id);
      await notify(issue, participants(issue), actor, {
        type: notificationService.Type.ISSUE_COMMENT,
        title: `${actor.name || 'Someone'} replied`,
        body: (dto.body || `${fileRows.length} file(s) attached`).slice(0, 200),
      });
      return detail(id, actor);
    },

    /** Moves it to a person or a department (the department head then assigns). */
    async assign(id, dto, actor) {
      const issue = await load(id, actor);
      assertMay(issue, actor, 'assign', 'Only whoever raised it, whoever it is with, or the department head can move this issue');
      const target = await resolveTarget(dto, issue);
      if (target.assignee_id === issue.assignee_id && target.department_id === issue.department_id) {
        throw new ConflictError('It is already there');
      }
      await repository.update(id, {
        assignee_id: target.assignee_id, department_id: target.department_id, assigned_at: new Date(),
        // A new owner starts it themselves.
        status: 'OPEN',
      });
      await event(issue, actor, `${target.assignee_id ? `Assigned to ${target.label}` : `Sent to ${target.label}`}${dto.note ? ` — ${dto.note}` : ''}`);
      await auditService.record({
        action: auditService.Action.UPDATE, entity: 'Issue', entityId: id, actor,
        changes: { assignee_id: { from: issue.assignee_id, to: target.assignee_id }, department_id: { from: issue.department_id, to: target.department_id } },
      });
      const after = await repository.findCore(id);
      await notify(after, [target.notifyId], actor, {
        type: notificationService.Type.ISSUE_ASSIGNED,
        title: target.assignee_id ? 'Issue assigned to you' : `Issue for ${target.label.split(' (')[0]} — assign it`,
        body: dto.note || `by ${actor.name || 'a colleague'}`,
        intro: target.assignee_id
          ? `${actor.name || 'A colleague'} assigned this issue to you.`
          : `${actor.name || 'A colleague'} sent this issue to your department. As its head, assign it to someone in the team (or take it).`,
      });
      // Whoever raised it follows where it went.
      if (issue.raised_by_id !== actor.id && issue.raised_by_id !== target.assignee_id) {
        await notify(after, [issue.raised_by_id], actor, { type: notificationService.Type.ISSUE_COMMENT, title: 'Your issue moved', body: `now with ${target.label}` });
      }
      return detail(id, actor);
    },

    /** Whoever it is with starts work on it. */
    async start(id, actor) {
      const issue = await load(id, actor);
      assertMay(issue, actor, 'start', 'Only the person it is with can start it');
      await repository.update(id, { status: 'IN_PROGRESS' });
      await event(issue, actor, 'Started work');
      return detail(id, actor);
    },

    /** Whoever it is with resolves it, saying how; whoever raised it confirms. */
    async resolve(id, dto, actor) {
      const issue = await load(id, actor);
      assertMay(issue, actor, 'resolve', 'Only the person it is with can resolve it');
      await repository.update(id, { status: 'RESOLVED', resolution: dto.resolution, resolved_at: new Date() });
      await event(issue, actor, `Resolved — ${dto.resolution}`);
      await notify(issue, participants(issue), actor, {
        type: notificationService.Type.ISSUE_RESOLVED,
        title: 'Issue resolved',
        body: dto.resolution.slice(0, 200),
        intro: `${actor.name || 'A colleague'} resolved this issue. If you raised it, confirm and close it — or reopen it saying why.`,
      });
      return detail(id, actor);
    },

    /** Whoever raised it confirms the resolution and closes it. */
    async close(id, dto, actor) {
      const issue = await load(id, actor);
      assertMay(issue, actor, 'close', 'Only the person who raised it can close it, once resolved');
      await repository.update(id, { status: 'CLOSED', closed_at: new Date() });
      await event(issue, actor, `Closed${dto.note ? ` — ${dto.note}` : ''}`);
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'Issue', entityId: id, actor, changes: { status: { from: issue.status, to: 'CLOSED' } } });
      await notify(issue, participants(issue), actor, { type: notificationService.Type.ISSUE_CLOSED, title: 'Issue closed', body: dto.note || `by ${actor.name || 'the person who raised it'}` });
      return detail(id, actor);
    },

    /** Not fixed after all: back to whoever had it, with the reason. */
    async reopen(id, dto, actor) {
      const issue = await load(id, actor);
      assertMay(issue, actor, 'reopen', 'Only the person who raised it can reopen it');
      await repository.update(id, { status: 'OPEN', resolved_at: null, closed_at: null, reopened_count: { increment: 1 } });
      await event(issue, actor, `Reopened — ${dto.note}`);
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'Issue', entityId: id, actor, changes: { status: { from: issue.status, to: 'OPEN' }, reopened: true } });
      await notify(issue, participants(issue), actor, {
        type: notificationService.Type.ISSUE_REOPENED, title: 'Issue reopened', body: dto.note,
        intro: `${actor.name || 'The person who raised it'} reopened this issue.`,
      });
      return detail(id, actor);
    },

    /** Not needed any more (whoever raised it, while open). */
    async cancel(id, dto, actor) {
      const issue = await load(id, actor);
      assertMay(issue, actor, 'cancel', 'Only the person who raised it can cancel it, while it is open');
      await repository.update(id, { status: 'CANCELLED', closed_at: new Date() });
      await event(issue, actor, `Cancelled — ${dto.note}`);
      await auditService.record({ action: auditService.Action.UPDATE, entity: 'Issue', entityId: id, actor, changes: { status: { from: issue.status, to: 'CANCELLED' } } });
      await notify(issue, participants(issue), actor, { type: notificationService.Type.ISSUE_CLOSED, title: 'Issue cancelled', body: dto.note });
      return detail(id, actor);
    },

    /** Keeps someone informed (anyone who can see it may add people). */
    async addWatcher(id, userId, actor) {
      const issue = await load(id, actor);
      if (['CLOSED', 'CANCELLED'].includes(issue.status)) throw new ConflictError('This issue is closed');
      const [user] = await repository.activeUsers([userId]);
      if (!user) throw new ValidationError('Validation failed', [{ field: 'user_id', message: 'Choose an active person' }]);
      if (isWatcher(issue, { id: userId })) return detail(id, actor);
      await repository.addWatcher(id, userId);
      if (userId !== actor.id) {
        await event(issue, actor, `Added ${user.name} to keep informed`);
        await notify(issue, [userId], actor, { type: notificationService.Type.ISSUE_COMMENT, title: 'You were added to an issue', body: `by ${actor.name || 'a colleague'}` });
      }
      return detail(id, actor);
    },

    /** Stops keeping someone informed: themselves, or anyone if you raised it. */
    async removeWatcher(id, userId, actor) {
      const issue = await load(id, actor);
      if (userId !== actor.id && !isRaiser(issue, actor) && !managesAll(actor)) {
        throw new ForbiddenError('You can remove only yourself');
      }
      await repository.removeWatcher(id, userId);
      if (userId === actor.id && !seesAll(actor) && !isRaiser(issue, actor) && !isAssignee(issue, actor) && !isHead(issue, actor)) {
        return null; // they no longer see it
      }
      return detail(id, actor);
    },

    /** A file on an issue, for anyone who can see the issue. */
    async fileFor(fileId, actor) {
      const row = await repository.findFile(fileId);
      if (!row) throw new NotFoundError('File');
      await load(row.issue_id, actor);
      if (/[\\/]/.test(row.stored_name)) throw new NotFoundError('File');
      const file = await fileStore.open(fileKey(row.stored_name));
      if (!file) throw new NotFoundError('File');
      return { file, file_name: row.file_name, mime_type: row.mime_type };
    },
  };
}

const issueService = createIssueService(issueRepository);

module.exports = { issueService, createIssueService, permissionsFor, TYPE_LABEL };
