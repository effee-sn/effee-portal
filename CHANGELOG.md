# Changelog

All notable changes to the Effee Portal. One version number covers the whole
platform (backend and frontend together).

Versions follow **MAJOR.MINOR.PATCH**:

- **PATCH** (1.0.**1**) — bug fixes and small corrections.
- **MINOR** (1.**1**.0) — new features or improvements.
- **MAJOR** (**2**.0.0) — big changes, such as a new engine or a change that needs special steps to upgrade.

Each release is tagged in git (`v1.0.0`, …), so the VPS can be moved to an exact version and rolled back with `git checkout v<version>`.

---

## [1.1.0] — 2026-10-16

### Sales — each person changes only their own data

- **Enquiry details** (customer, contact, title, type, description, expected value and close date, currency, application) can be edited only by the **person who raised the enquiry** (with Sales → Edit, while it is with them). Internal Sales sees them read-only.
- **Documents:** only the person who uploaded a document can **replace** or **delete** it. Internal Sales still uploads and manages its own concept, power calculation, costing and offer documents.
- **Activities and reviews:** only the person who logged an entry can **edit** or **delete** it.
- Super Admin can still change anything, to correct mistakes.

### Added

- **Light, Dark and System themes.** Each user picks one from the **theme button in the top bar** (next to the bell) or in **Settings → Profile → Appearance**; it is saved to their account and follows them to any computer. *System* follows the device's light/dark setting. Printing always stays light.
- **What's new popup.** After each release, every user sees a short list of what changed, once (only the items relevant to their permissions). New accounts are not shown it. It can be opened again any time from **user menu → What's new**. The user-facing notes live in `Frontend/lib/whatsNew.js`.
- New permission **Sales → Reassign** (`SALES_REASSIGN`): needed to reassign an enquiry or change its owner. Grant it per role in **Administrator → Roles**; Sales → Edit no longer includes it.

### Fixed

- The Roles permission matrix now shows every action, including **Export** (Reports) and the new **Reassign** — Export was missing before.

---

## [1.0.0] — 2026-10-16

The first numbered release: everything built from 29 July to 16 October 2026.

### Service — Beta

Service ticketing and multi-department tasks are in **beta**: complete and in use, but still being refined.

- **Service tickets** with a reference number (SRV-…), source type, service location, severity, impact details and billing (billable / non-billable with a required cost center).
- **Multi-department tasks:** the project manager adds an issue per department and dispatches them in parallel; each department lead can assign a resolver, who submits work back for the lead to validate. When every department has resolved, the ticket goes to the initiator to confirm.
- **Resolution plan and work report** per department task — a versioned plan (draft → final) and a report; the Resolve button stays locked until both exist. Both freeze once the task is resolved or declined.
- **Close-out:** customer confirmation, an observation window, then manual close. Reopening sends the ticket back to the project manager and starts a new round.
- **Ticket comments** with replies and @mentions, in a side drawer.
- **My Tickets** inbox for everyone the flow involves, and a **Services** list with search, sticky headers, a trash (restore / permanent delete) and a billing column.
- The **Service** app is shown only to people with a service permission or service work assigned to them; adding, dispatching and redirecting departments needs **Service → Edit**.

### Sales

- **Enquiries** of two types — *Generated* (raised by field sales) and *Incoming* — moving through **New → Contacted → Review → Concept → Costing → Costing Review → Offer Released → Follow-up ⇄ Negotiation → Negotiation Follow-up → Won / Lost**, one step at a time.
- **Stage gates:** documents and steps required before moving on (enquiry format, review concluded, concept and power-source calculation, costing, costing review, offer sent).
- **Field ⇄ Internal handoff:** the enquiry is always "with" one person; it passes automatically between field sales and the chosen Internal Sales handler at the right stages. **Reassign** for supervisors.
- **Documents** per stage with **versions** (replacing keeps the old file as history); **offer revisions** each carry their own price; mark offers as sent.
- **Activity timeline** (calls, meetings, Teams, site visits, email) with minutes, outcomes, participants, temperature and the next follow-up; **internal reviews** with minutes of meeting and the next review date.
- **Follow-up reminders:** a set time before each follow-up (site visits 1 day, 3 hours and 15 minutes before by default; other kinds 15 minutes before), date-only follow-ups at 9:00 AM; timings set in **Sales → Configuration**. **Stalled-stage** reminders when an enquiry sits too long in a stage.
- **Stage history**, time in stage and aging badges; **Won / Lost** with close-out details; **Reopen**.
- **Sales configuration:** applications list, win probability per stage (with stage explanations), reminder timings.
- **Sales dashboard:** pipeline, weighted value, Offered vs Won and more.
- **Permissions:** **Sales → Edit** gives full editing of an enquiry while it is with you; the creator without Edit can upload and replace documents, log activities and send the enquiry to Review only while it is at New or Contacted.

### Projects

- Projects module (create, edit, list), optionally linked to the won enquiry it came from.

### Master Data

- **Customers and contacts**, shared by every module.
- **Currencies** with a manual exchange-rate history; INR is the base and default. Enquiries can be in any currency; totals and reports convert to rupees, and won orders and sent offers lock the rate they were made at.

### Reports

- **MIS Reports** module with 10 Sales reports, shown as tables with filters and exported to Excel; exports are audit-logged. Needs **Reports → View / Export**.

### Home dashboard

- A "what needs me" dashboard: overdue and due follow-ups, enquiries with me, stalled enquiries, tickets and tasks with me, unread notifications.

### Notifications and email

- **In-app bell** and **browser push** notifications for hand-offs, assignments, reminders and decisions.
- **Email** for every notification, in a branded template with the key details and a button into the portal; SMTP is configured in `.env` (Microsoft 365 Direct Send supported). Every email sent is logged.
- **Welcome email** for new users with a one-time set-password link (no password is ever emailed); used or expired links say so.

### Administration

- **Users, roles and departments**, with a compact permission matrix per role.
- **Flow Builder** with Services and Sales tabs (service step workflow; the Sales Internal Sales handler).
- **Microsoft sign-in (SSO)** — built, with administrator switches; goes live once the portal has HTTPS and the Entra app is set up.
- **Audit log** with readable details: who (name and email), what (record names, not ids), before/after values, filters by module, action, user and date.
- **Backup & restore** (Super Admin): one file with the full database **and** all uploaded documents and files; restore puts back both. `.env` is never included.
- **Settings:** company name and logo, login security, email test.
- The installable app (PWA) uses a square icon made from the company logo.
- `Installation.txt` covers setup, upgrades, backups, database reset and troubleshooting.
