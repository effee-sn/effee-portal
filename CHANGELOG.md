# Changelog

All notable changes to the Effee Portal. One version number covers the whole
platform (backend and frontend together).

Versions follow **MAJOR.MINOR.PATCH**:

- **PATCH** (1.0.**1**) — bug fixes and small corrections.
- **MINOR** (1.**1**.0) — new features or improvements.
- **MAJOR** (**2**.0.0) — big changes, such as a new engine or a change that needs special steps to upgrade.

Each release is tagged in git (`v1.0.0`, …), so the VPS can be moved to an exact version and rolled back with `git checkout v<version>`.

---

## [1.5.0] — 2026-10-25

### Added — Material master

- **Master Data → Materials**: the material master. Each material has an **IMM code**, drawing no. (optional free text, **one material each** — bulk entry marks a number another material already uses, or a repeat within the entry; a subassembly's own item carries its drawing no.), item name, description, technical specification, material type (**Finished / Bought-out / Consumables**), material (e.g. MS, SS304) and remarks (optional). Search and filter by type and prefix; open a row to edit it. The IMM code never changes.
- **Bulk entry**: add many materials at once in a grid — each row picks its IMM code prefix from a searchable list and shows the code it will get; rows can be **pasted from Excel**; everything saves together.
- **Administrator → Configuration → Material Codes**: the IMM code prefixes. Each prefix has its own numbering — prefix, an optional separator (`-` or `_`), number of digits and next number, with a live preview (e.g. `IMM-00001`). Once a prefix is used its format is fixed and its counter only moves forward. Codes are unique even when several people save at the same time.
- **Administrator → Configuration**: every module's settings in one place, with a sidebar per module — **Sales** (stage probability, applications, reminders — moved here from the Sales menu; the old link forwards) and **Material Codes**. Each section shows to those with its configuration permission.
- **Master Data → Subassemblies** (drawing-wise): build subassemblies — a **name** and **drawing no.**, then add lines from the material master by searching their **IMM code, drawing no. or item name**, each with a **quantity** (in the material's unit). Drawing numbers are unique; a material appears once per subassembly. Inactive or deleted materials can't be added but stay flagged where already used. (This was the Manufacturing app's "BOM" page, then Master Data → BOM; the app is removed and the old links forward. "BOM" is kept for the project BOM to come.)
- **A subassembly is an item**: each has its **own IMM code** — a new code from a chosen prefix and unit, or an existing Finished material — which follows its name and drawing no. and is deleted with it. In the materials list it carries a *Subassembly* badge (filter: parts only / subassemblies only); its name, drawing no. and type are changed on the subassembly. Subassemblies made before this get their code the next time they're opened and saved.
- **Multi-level**: a subassembly's lines can include **other subassemblies**, any levels deep (up to 10). Loops are blocked — a subassembly can't contain itself, directly or further down.
- **Revisions** (set in **Administrator → Configuration → Revisions**): the **first release is the drawing number only — "Original"** (its name can be changed), and each released change after it is **Rev A, B, C …** (or 01, 02 …); or, if chosen there, the first release is already Rev A / 00. A subassembly's lines live on a revision. A new subassembly starts as **draft Original**; **releasing** it (new permission **Subassemblies → Approve**, with a **change note** after the first) locks it and makes it the current revision, and the one before becomes **Superseded** — readable forever, never changed. **New revision** starts the next draft as a copy of the current one; one draft at a time; a draft can be discarded. The IMM code stays the same across revisions (a part that is no longer interchangeable should be a new subassembly).
- **Revision history and compare**: every revision with its status, change note, who released it and when; **Compare** any two — lines added, removed, and quantities or child revisions changed.
- **A child is held at its revision**: a subassembly on another is held at the revision it was added at — a later revision of it doesn't change the parent. The parent shows **"Rev C available"**, and a new draft of the parent can move to it with one click. Only released subassemblies can be added. **Used in** shows which revision each parent holds.
- Existing subassemblies become **Rev A, released**, with their current lines.

### Added — Projects: machines and Machine IDs; department numbers

- **Machines on a project**: a project has one or more machines (units), each with its own **Machine ID** (e.g. `M0001`) — the start of every tag number in the project BOM to come. A new project says how many machines it starts with (IDs previewed); more are added on the project's page. A Machine ID never changes and is never reused; machines can be named (e.g. "Panel A") and removed.
- **Project page**: a project in the list now opens its own page — details and its machines (the project BOM will live here).
- **Administrator → Configuration → Machine IDs**: the numbering — prefix, optional separator (`-` or `_`), digits and next number, with a preview. Once IDs are given out the format is fixed and the counter only moves forward. New permissions **Project Config → View / Edit** (given to Admin).
- **Department no.** on each department (Administrator → Departments), unique among departments — the department part of tag numbers.
- **A subassembly's department**: the department it comes from, set on the subassembly (shown in the list).

### Added — Project BOM

- **BOM tab on a project**: for **each machine**, the subassemblies (held at a released revision) and loose materials it needs, with quantities and the department each comes from (a subassembly's own department by default). **Copy lines from** another machine for identical machines.
- **Lock** (new permission **BOM → Approve**; a change note after the first lock): every level is exploded through the subassembly revisions held into **tag numbers** — `MachineID-DeptNo-SubassemblyIMM-PartIMM`; a subassembly or Finished part needed more than once gets one tag per piece (`/1`, `/2` …), each with its own parts under it; bought-out and consumable parts get one tag carrying the quantity. The locked BOM is a **snapshot**: quantities, revisions held and each material's details stay as they were at lock.
- **Tags** per machine (a preview while drafting), **Totals** — every plain material with quantities multiplied through the levels, per machine and for the project, plus how many of each subassembly to build — and **Excel** export of a locked BOM (tags, material totals, subassemblies).
- **BOM revisions**: a locked BOM can't change; **New revision** starts Rev 2 as a copy, locked with a change note — Rev 1 is superseded and kept. Lines show **"Rev C available"** when a subassembly has moved on, with **Use Rev C** in a draft.
- A machine on a locked BOM can't be removed from the project.
- New permissions **BOM → View / Edit / Approve**: View to roles that can view projects, Edit to roles that can edit projects, Approve (lock) to Admin.
- **Structure & totals**: each subassembly shows its whole structure as an expandable tree, and the **total of every plain material** needed for one of it (quantities multiplied through the levels). **Used in** lists the subassemblies it is on; one in use can't be deleted. **Copy** starts a new subassembly from an existing one's lines.
- **Units of measure**: every material has a unit (Nos, Set, m, mm, kg, g, L, sqm to start), set in **Administrator → Configuration → Units of Measure** (a used unit keeps its code). Bulk entry has a Unit column, a "unit for all rows" picker and a Unit column in the Excel paste; the list filters by unit; the BOM shows each line's unit next to its quantity. Existing materials start as **Nos**.
- **Drawing revisions of Finished parts**: a Finished part (not a subassembly's item) has its own revisions — **Original** when created, then Rev A, B … A change to its **description, technical specification or material** is a new **draft revision**, released with a change note (new permission **Materials → Approve**, given to the roles that release subassemblies); it can't be edited directly. Subassembly and project BOM lines **hold the part at a revision** and show **"Rev B available"** when a newer one is released; only a new draft moves them on. Locked project BOM tags record the part's revision and its specification at that revision.
- **Material page**: a row opens the material's own page — **Details**, **Revisions** (Finished parts), **Where used** (the subassemblies listing it, with quantities and the part revision each holds) and **History** (who changed what, field by field).
- **Used materials are protected**: a material on a subassembly can't be deleted (make it inactive instead) and its unit can't change.
- **Duplicate warning** in bulk entry: before saving, rows with the same item name, material and specification as an existing material (or as another row) are pointed out — change them, or **Save anyway**.
- **Excel export** of the materials list (with the current search and filters). Its columns, without the IMM code and Status, paste straight back into bulk entry.
- Search dropdowns (drawing no., BOM add-material) search as you type and show **10 at a time**, with **Show more**.
- New permissions **Materials → View / Create / Edit / Delete** and **Material Codes → View / Create / Edit / Delete** (database migrations add them and the new tables; units of measure use the Material Codes permissions). The **BOM → View / Create / Edit / Delete** permissions are renamed **Subassemblies → View / Create / Edit / Delete**; roles keep what they had. Creating a subassembly also creates its item, without needing Materials → Create. New: **Subassemblies → Approve** (release revisions) — given to every role that has Subassemblies → Edit, so remove it there to keep releasing to fewer people.

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
- **Follow-up reminders:** a set time before each follow-up (site visits 1 day, 3 hours and 15 minutes before by default; other kinds 15 minutes before), date-only follow-ups at 9:00 AM; timings set in **Administrator → Configuration → Sales**. **Stalled-stage** reminders when an enquiry sits too long in a stage.
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
