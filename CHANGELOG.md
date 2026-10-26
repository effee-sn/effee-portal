# Changelog

All notable changes to the Effee Portal. One version number covers the whole
platform (backend and frontend together).

Versions follow **MAJOR.MINOR.PATCH**:

- **PATCH** (1.0.**1**) — bug fixes and small corrections.
- **MINOR** (1.**1**.0) — new features or improvements.
- **MAJOR** (**2**.0.0) — big changes, such as a new engine or a change that needs special steps to upgrade.

Each release is tagged in git (`v1.0.0`, …), so the VPS can be moved to an exact version and rolled back with `git checkout v<version>`.

---

## [1.5.1] — 2026-10-27

### Added — Sales: see only your own enquiries

- New permission **Sales own → View** (`SALES_VIEW_OWN`): see only your own enquiries — ones **you raised, you own, or that are with you now** in the flow (so Internal Sales still see what is handed to them at Review). **Sales → View** still shows all of them. It applies to the list, the Kanban, the enquiry page, its activities, reviews and documents; anyone else's enquiry reads as not found.
- The **Sales dashboard** and **MIS reports** show company-wide figures, so they stay with Sales → View.
- It is given to no role on upgrade: in **Roles**, give a role *Sales own → View* (and take away *Sales → View*) to limit it. A database migration adds it.

### Fixed — Sales: activity rules now apply as intended

- Logging an activity or review was still blocked for anyone without **Sales → Create**, and editing your own for anyone without **Sales → Edit** — the route checked those before the rules of 1.4.1 and 1.4.3 could apply. Now the person an enquiry is with logs with View alone, and **Sales activity → Edit** is what editing your own entry needs.
- Roles shows module names with spaces ("Sales activity", not "Sales_activity").

---

## [1.5.0] — 2026-10-27

### Added — Sales: Kanban view of the enquiries

- **Sales → Enquiries** has a **List / Kanban** switcher (remembered per browser). The Kanban shows one column per stage, New to Lost, each with its count; cards show the ref no., title, customer, who it is with, value, temperature and the "days in stage" warning, and open the enquiry. Each column loads 20 at a time (**Show more**), with the same search and application filter as the list. Stages are still moved on the enquiry itself, where the gates apply.

### Added — Sales: who logged each activity and review

- Every activity and review now shows **"Logged by NAME · DATE TIME"**, and — when it was corrected later — **"edited by NAME · DATE TIME"** (the last edit, taken from the audit log).

### Fixed — Sessions now end by themselves when they expire

- When a sign-in expires (JWT_EXPIRES_IN, 7 days by default) the portal now **signs out on its own** and opens the login page with **"Your session has expired — please sign in again."** Before, the expired session stayed on screen and every action failed until you logged out and back in by hand.
- It happens at the expiry time even on an idle page (re-checked when you return to a sleeping or background tab), and whenever the server no longer accepts the session (expired, or the user was disabled). A stale expired token no longer sends the login page round in a loop.

---

## [1.4.3] — 2026-10-27

### Changed — Sales: editing activities and reviews; the Review gate

- New permission **Sales activity → Edit** (`SALES_ACTIVITY_EDIT`): edit the activities and reviews **you logged** — never anyone else's. Set it per role in **Roles**, instead of it being fixed. On upgrade it is given to **every role that has Sales → View**, so nothing changes until you take it away from a role (a database migration adds it).
- **An entry can be edited only while the enquiry is still in the stage it was logged in.** Once the enquiry moves on, that stage's activities and reviews are its record and stay as they are. (The first activity that moves an Incoming enquiry to Contacted is recorded under Contacted.)
- Deleting is unchanged: **Sales → Delete**, own entries only. Super Admin can still edit and delete any entry, at any stage.

### Fixed — Sales: the Review gate

- **Review → Concept** (and Costing, for refurbishments) now needs a review marked "no future review" that was **logged in the Review stage**. A review logged earlier, at New or Contacted, no longer opens it.

---

## [1.4.2] — 2026-10-27

### Changed — Sales: your own activities and reviews you can always correct

- **Editing an activity or review** is now for **the person who logged it** — no Sales → Edit needed, so mistakes can always be put right by whoever made them. **Nobody else** can edit it (Super Admin still can, to fix anything).
- Deleting is unchanged: **Sales → Delete**, own entries only.

---

## [1.4.1] — 2026-10-26

### Fixed — Sales: who can log activities and reviews

- **The person an enquiry is with can always log** activities and reviews on it with **Sales → View** alone — the flow gives access (e.g. Internal Sales at Review, who often has no Sales → Create). 1.4.0 had required View + Create from everyone. Anyone else still needs **Sales → View + Create**.
- **Closed at Won / Lost**: no new activities or reviews once an enquiry is won or lost (reopen it first). Editing and deleting your own existing entries is unchanged.

---

## [1.4.0] — 2026-10-25

### Changed — Sales: activities and reviews open at every stage

- **Activities and reviews can be logged at any stage** (New to Won/Lost), by anyone with **Sales → View + Create** — no longer only by the person the enquiry is with. The **Reviews** card now shows from New.
- **Editing** an entry needs **Sales → Edit**; **deleting** needs **Sales → Delete** — on your own entries only (Super Admin: any).
- Ticking **Needs negotiation** (which moves the enquiry to Negotiation) stays with the person the enquiry is with.

---

## [1.3.1] — 2026-10-24

### Added

- **Rows per page** (10 / 20 / 50 / 100) on the paged lists: Sales → Enquiries, Master Data → Customers, Administrator → Users, Departments and Audit Log. Changing it keeps the search and filters; each person's choice is remembered per list in their browser. Announced in the **What's new** window.

---

## [1.3.0] — 2026-10-23

### Added — Sales: refurbishment enquiries

- A **Refurbishment enquiry** checkbox on new enquiries (Generated and Incoming) and in the enquiry's Edit form. A refurbishment enquiry **skips the Concept stage**: it goes from **Review straight to Costing**. Moving on from Review needs the review concluded; no concept or power-source documents are needed, and their slots are hidden.
- The flag can be changed until the Review stage and is fixed after that.
- Refurbishment enquiries are tagged in the enquiry header and in the enquiry list.

---

## [1.2.0] — 2026-10-23

### Added — Manufacturing (started)

- New **Manufacturing** app in the app switcher with a **Bill of Materials** page (empty for now; its screens and workflow are being defined).
- New permissions **BOM → View / Create / Edit / Delete**, granted per role in **Administrator → Roles** (a database migration adds them).

---

## [1.1.2] — 2026-10-23

### Fixed

- Uploading a document larger than 1 MB failed with "Unexpected token '<' … is not valid JSON". The cause is nginx's default upload limit (1 MB) on the server; raise it with `client_max_body_size 50M;` (see Installation.txt). The portal now also explains such errors in plain words — e.g. "This file is too large for the server…" for an upload over the limit, or "The server isn’t responding" when it is down — instead of the cryptic message, on every screen including the logo upload and password pages.

---

## [1.1.1] — 2026-10-16

### Changed — Sales: the flow gives access

- Whoever an enquiry is **with** (as the flow hands it over) can do that stage's work **without the Sales → Edit permission**: log activities and reviews, upload documents and replace their own, set the offer price and mark it sent, and move the stage forward. Internal Sales works Review → Offer Released and Negotiation; Field Sales works New/Contacted and the follow-ups. When the enquiry moves on, they are read-only until it comes back.
- **Won** — only the person who raised the enquiry, while it is with them. **Lost** — whoever holds it, including Internal Sales (e.g. not feasible).
- **Reopen** a won or lost enquiry now needs **Sales → Reassign**.
- **Sales → Edit** is now an extra: editing the enquiry's details (only the person who raised it) and deleting your own documents, activities and reviews.

---

## [1.1.0] — 2026-10-16

### Sales — each person changes only their own data

- **Enquiry details** (customer, contact, title, type, description, expected value and close date, currency, application) can be edited only by the **person who raised the enquiry** (with Sales → Edit, while it is with them). Internal Sales sees them read-only.
- **Documents:** only the person who uploaded a document can **replace** or **delete** it. Internal Sales still uploads and manages its own concept, power calculation, costing and offer documents.
- **Activities and reviews:** only the person who logged an entry can **edit** or **delete** it.
- Super Admin can still change anything, to correct mistakes.

### Added

- **Light, Dark and System themes.** Each user picks one from the **theme button in the top bar** (next to the bell) or in **Settings → Profile → Appearance**; it is saved to their account and follows them to any computer. *System* follows the device's light/dark setting. Printing always stays light.
- **What's new popup.** After each release, every user sees a short list of what changed, once (only the items relevant to their permissions). New accounts are not shown it. It can be opened again any time from the **✨ button in the top bar** or the user menu. The user-facing notes live in `Frontend/lib/whatsNew.js`.
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
