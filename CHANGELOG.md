# Changelog

All notable changes to the Effee Portal. One version number covers the whole
platform (backend and frontend together).

Versions follow **MAJOR.MINOR.PATCH**:

- **PATCH** (1.0.**1**) — bug fixes and small corrections.
- **MINOR** (1.**1**.0) — new features or improvements.
- **MAJOR** (**2**.0.0) — big changes, such as a new engine or a change that needs special steps to upgrade.

Each release is tagged in git (`v1.0.0`, …), so the VPS can be moved to an exact version and rolled back with `git checkout v<version>`.

---

## [1.8.0] — not yet released (branch feature/flow-engine)

### Added — Flow Builder: flows for Sales, on a canvas

- **Administrator → Flow Builder → Sales** now has **Setup** (the Internal Sales person, as before) and **Flows**: who gets each stage, approvals before actions and who is told — drawn as blocks and arrows (React Flow canvas), with no code.
- **Blocks:** When (what starts the flow), Which stage? (a way per group of stages), If (conditions on value in ₹, type, refurbishment, temperature, application, customer, owner, and the event's details), **Assign**, **Approval**, **Notify** and End.
- **Assign** (at the moment of a stage move): a person; a department — its head, the least busy member, turn by turn, or **the head picks** someone in the team; a role; the owner; whoever raised it; the same person as at an earlier stage; or the Internal Sales person set in Setup. If nobody active matches, the built-in rule decides — an enquiry is never left with nobody. One flow decides each stage (a clash is refused).
- **Department queue:** "head picks" sends the enquiry to the department; the head holds it and chooses the member from **Sales → Assign to my team** or a banner on the enquiry. Reminded after 4 hours.
- **Approvals:** "Before …" flows run the moment someone tries to move a stage, mark an offer sent, mark Won or Lost, or reopen — and can hold it: *"Needs approval from X — request sent"*. Any one or all approvers; reminder after 4 hours, escalation to the Super Admins after 24; an approver doing it themselves needs no request; rejecting needs a reason. An approval is used once, for that exact action. **My Approvals** (top-bar button with a count, and the user menu): waiting for me, decided by me, asked by me.
- **Notify:** bell, push and email to the owner, the holder, the raiser, a person, a role, a department or its head, with `{{words}}` from the enquiry and the event.
- **Builder:** Save draft, **Check** (problems shown on the blocks), **Test run** on a real enquiry (what each block would do — nothing sent or changed), Publish (a new version; runs keep the version they started with), Pause / Resume, put an older version back. After publishing an assigning flow: **move the current enquiries too?** — only the ones you tick.
- **Visibility:** a **Flows** section on each enquiry (approvals, and what each flow did — "Assigned to …", "Notified …"); a **run log** per flow; a ⚠ on flows naming someone who has left.
- **Ready-made drafts** (none live): *Sales hand-offs (today's rules)* — the built-in rule drawn, ready to publish; *Big offers need approval* (above ₹50 Lakh); *Late-stage loss alert*; *Big order won* (above ₹1 Crore) — choose their people, then publish.
- **Permissions:** Flow Builder → View / Create / Edit / Delete, and the new **Publish** (given to no role on upgrade — choose who in Roles; Super Admin always can).

### Added — Sales: costing value and offer margin

- **Final costing value** on the enquiry, entered by whoever holds it from Costing Review on (Costing Review, Offer, Negotiation). Optional — nothing waits on it.
- Each offer shows its **margin** over it: amount, **% of the offer** and **% on cost** (red when it loses money).
- Flows can use **Margin % of offer**, **Margin % on cost**, **Margin (₹)** and **Costing value (₹)** in If blocks and messages; the offer approval shows costing, offer and margin to the approver.
- An offer price must now be **more than 0**.

### Added — Approvals: lock, withdraw, clear states

- While an offer waits for approval its **price, deletion and the costing value are locked**; rejected or withdrawn, they unlock for rework.
- An approval is for **those figures**: change the price or costing value (or, for Won, the order value) and it asks again. Stage-move, Won, Lost and Reopen approvals are tied to the stage they were asked at.
- **Withdraw request** — the person who asked (or a Super Admin) takes a waiting request back, with a reason. The Approval block has a **Withdrawn** way out for its own messages, and a **Can be withdrawn** setting.
- Offers show where they stand: **⏳ Waiting for approval**, **✓ Approved — Mark sent**, or *Rejected by … : reason*. Being held is shown as information, not an error.
- Pausing, deleting or re-publishing a flow **cancels** the requests it was waiting on (approvers told “no action needed”, the asker told to try again).
- Check **warns** when approvers may be the person doing the action (holder, owner, raiser, a role or a department) — they would approve themselves.

### Fixed (found in real-user testing before release)

- Quick repeated clicks raised several approval requests and emails — now one.
- A double click could mark an offer sent twice and move the stage twice; marking a sent offer again re-rated it — now refused.
- “All must approve”: two approving at the same moment left it waiting; an escalated Super Admin could not approve it.
- “Before moving to a stage” offered stages that are entered automatically (Follow-up, Negotiation…) where it never runs — now only stages people move into.
- A background run could get stuck if loading the enquiry failed once.

### How Sales behaves on day one

Exactly as before. With no live flow, every hand-off, notification and gate is the built-in rule; the engine only records what happens. Switch features on one at a time (suggested: publish the hand-offs flow → the offer approval → department routing), watching each for a week.

**Upgrade:** 8 migrations — run `npx prisma migrate deploy` in `Backend`; a new frontend package (`@xyflow/react`) — run `npm install` in `Frontend`, then build.

## [1.7.2] — 2026-10-28

### Changed — Sales: follow-ups close only by following up

- **Mark done** is removed from the Follow-ups page and from the enquiry timeline. A follow-up now closes only when the next activity is logged on the enquiry (by the person who added it), or when the enquiry is won or lost — so nobody can close one without recording what happened. The old follow-ups had already been cleared.
- Only a **Super Admin** can still mark follow-ups done, with **Mark selected done** on the Follow-ups page, for odd cases (e.g. follow-ups left by someone who has left). The server refuses everyone else, including Sales → Edit.
- The daily overdue email and the Follow-ups page no longer mention marking done.
- Follow-ups already marked done keep their history.

### Changed — Follow-ups calendar, like Teams

- The calendar on **Sales → Follow-ups** is redesigned in the style of the Teams calendar, with **Today**, **‹ ›**, the date range and four views: **Day**, **Work week** (the default), **Week** and **Month**.
- Day / Work week / Week show an **hour grid**: each timed follow-up is a block at its time (enquiry ref, time, how, customer, what it's for); follow-ups with a day but no time sit in an **All day** strip on top; follow-ups at the same time sit side by side; today's column is highlighted with a red line at the current time. It opens at 8 AM.
- **Month** shows six weeks with up to three follow-ups a day and "+N more"; clicking a day (or "+N more") opens it in Day view.
- Colours by state: red overdue, amber today, blue upcoming, green done, with a legend.
- Clicking a follow-up opens a **card** with its details (when, enquiry, customer, stage, temperature, the activity it came from, who added it, who has the enquiry now) and **Open enquiry** / **Reschedule** (your own open follow-up).
- The search and filters apply to the calendar as before.

## [1.7.1] — 2026-10-28

### Added — Sales: overdue follow-ups emailed every day until done

- Every morning (from 09:00, `FOLLOWUP_REMINDER.DAY_TIME` in `APP_TIMEZONE`) each person with overdue follow-ups gets **one email** (and a notification) listing them: enquiry ref, how many days overdue, what the follow-up is for and the customer — up to 15, then "and N more" — with a button to the Follow-ups page's Overdue tab. It comes **every day until each follow-up is done** (followed up, marked done, or the enquiry won/lost). Before, a missed follow-up was reminded once and then never again.
- It goes to the person **who added** the follow-up; if that user is no longer active, to whoever holds the enquiry.
- One email per person per day, even with several API workers (PM2 cluster): the day is claimed in a new `FollowupDigest` table before sending.

**Upgrade:** one migration — run `npx prisma migrate deploy` in `Backend`.

## [1.7.0] — 2026-10-28

### Added — Sales → Follow-ups

- A new page, **Sales → Follow-ups**, shows every customer follow-up in one place, in four tabs with counts: **Overdue** (how many days), **Today**, **Upcoming** and **Done**. Each row: the date and time and how (call, meeting, Teams, site visit, email), the enquiry (ref, title, customer — a link), what the follow-up is for and the activity it came from, the stage, temperature, **who added it** and who has the enquiry now. A done follow-up shows how it was done and the outcome of the entry that did it.
- **Filters**: search (enquiry ref, title, customer, subject), added by, stage and medium. A **calendar** view shows a month with each day's follow-ups, coloured by state.
- From a row: **Open** the enquiry, **Reschedule** (your own follow-up — a new day, with or without a time) or **Mark done**.
- **Super Admin — clear old follow-ups at once**: tick follow-ups on the Overdue, Today or Upcoming tab (or all on the page; 50, 100 or 200 rows a page) and **Mark selected done**, with one optional note (e.g. "old follow-ups cleared").
- **Who sees what** — two new permissions: **Follow-ups → View** (everyone's follow-ups) and **Follow-ups own → View** (only the ones you added). The update gives them to the roles that see all enquiries / only their own today; change them per role in Roles.
- The home dashboard's **Follow-ups overdue / due today** now count the follow-ups **you added** (was: on the enquiries you hold), and open the Follow-ups page on that tab.

### Fixed — Sales: a follow-up is done once it is acted on

- Logging a new activity on an enquiry now marks **your own earlier follow-ups** on it as **done** — the new entry is the follow-up having happened. Someone else's follow-up on the same enquiry stays open (it's their task); reviews and customer interactions are kept apart. Before, the old follow-up stayed "overdue" forever, inflated the dashboard's "Follow-ups overdue" count and could still be reminded.
- The timeline shows a done follow-up as **"✓ Done · followed up 27 Oct, 11:59 AM"**, with **"· 2 days late"** when it happened after its date; a done review reads "· held".
- **Mark done**: an open follow-up can be closed without a new entry (e.g. handled by someone else, no longer needed) — by the person who added it, or with Sales → Edit — with an optional note.
- When an enquiry is **won or lost**, its open follow-ups close with it.
- Deleting an entry opens again the follow-ups it had done. Existing data: follow-ups already followed up by the same person, and those on won / lost enquiries, are marked done by the update (database migration).

### Fixed — Sales: a follow-up date without a time

- A follow-up given a **date but no time** was saved as a timed one at 5:30 AM (and reminded before it) since 12 Oct 2026 — the date-only check never matched. It is a day again, reminded that morning (09:00); the update corrects the ones saved that way.

---

## [1.6.3] — 2026-10-27

### Fixed — Sales: foreign amounts use international digit grouping

- Amounts in a currency other than INR are now grouped in **thousands and millions** — €3,818,181.82, $5,000,000.00 — instead of lakh and crore (€38,18,181.82). Rupee amounts keep Indian grouping (₹38,18,181.82). Each currency shows its own number of decimals (2 for most; none for e.g. JPY and KRW). Applies everywhere money is shown in its own or the top-bar currency (enquiry list, Kanban and page, offers, dashboards) and to the amounts in notification emails.

### Changed — Short amounts in words on dashboards and lists

- **Dashboards** (home and Sales → Dashboard) and the **enquiry list and Kanban** show amounts short, in words: rupees in **Thousand / Lakh / Crore** (₹38.18 Lakh, ₹12.5 Crore), other currencies in **Thousand / Million / Billion** (€3.82 Million, $2.5 Billion) — up to 2 decimals (was ₹38.2 L, €3.8M). The full figure shows on hover, and the **enquiry page** keeps the full figures.

### Changed — MIS reports follow the top-bar currency

- The money columns of the **Sales MIS reports** (open, offered, won and lost values, the register's value and weighted value, order and offer values) are now shown in the currency chosen in the top bar, by the same rule as the Sales screens: an amount already in that currency as entered; open amounts at today's rate; won orders and sent offers at the rate of their day. Column titles say the currency (e.g. "Won value (EUR)"), the filter line says "Amounts in EUR …", and the Excel / CSV export follows. With INR chosen, reports are exactly as before. The "Rate (₹)" column stays in rupees.

---

## [1.6.2] — 2026-10-27

### Fixed — Sales: the enquiry list fills the screen

- **Sales → Enquiries** now fills the screen below the top bar at any screen size: the list (and the Kanban columns) end at the bottom of the window instead of a fixed height that left a blank strip on some screens. The rows still scroll inside with the column headers on top.

---

## [1.6.1] — 2026-10-27

### Changed — Sales: amounts in their own currency show exactly as entered

- With the top-bar currency set to an enquiry's own currency, its amount shows **exactly as entered** — a €10,000 enquiry viewed in EUR is €10,000, open or won. Before, every amount went through rupees and back, so a won order could drift (e.g. €9,523.81) when its locked rate and the currency's rate history disagreed (a back-dated rate, or a currency with no history). Amounts in other currencies convert as before: open at today's rate, won orders and sent offers at the rate of their day. Applies to the enquiry list and Kanban, the enquiry page, the Sales dashboard and the home dashboard. MIS reports stay in ₹.

### Changed — Sales: a new enquiry takes the top-bar currency

- The **New enquiry** form no longer has its own currency dropdown: the enquiry is raised in the currency chosen in the top bar (shown on the form, read-only), so what is entered matches what is shown. An existing enquiry's currency can still be corrected on its Edit form until it is Won or Lost.

---

## [1.6.0] — 2026-10-27

### Added — Show money in any currency, from the top bar

- A **currency switch** (the active currencies) in the **top navigation bar**, beside the theme switch, shows money across the portal in the chosen currency — one choice for every page, applied the moment it changes (other open tabs follow too), remembered per browser; INR by default. It covers the **home dashboard**'s Sales tiles and pipeline, **Sales → Dashboard** (totals and charts), **Sales → Enquiries** (each value in the list and the Kanban — hover a value to see it as entered, e.g. "Entered as $50,000.00"), and an **enquiry's page**, where the expected value, the weighted value and the order value show their "≈" amount in it ("₹42,00,000.00 (≈ €38,181.82)"). MIS reports and their Excel exports stay in ₹.
- **Which rate:** an **open** enquiry converts at the chosen currency's rate **today**; a **won order** at its rate **on the day it was won**, and a **sent offer** at its rate **on the day it was sent** — from the currency's rate history (Master Data → Currencies). So past figures keep their actual value: with €1 = ₹100 last month and ₹110 now, ₹1,000 won last month shows as **€10.00**, while an open ₹1,000 shows as **€9.09**. Dashboard totals add each deal at its own day's rate. Display only — nothing stored changes.

### Added — Sales: sortable, sticky enquiry list

- **Sales → Enquiries** (List view): the **column headers stay on top** while the rows scroll, and a click on **Ref, Title, Customer, Stage, Owner or Value** sorts the list by it (click again to reverse; ▲ / ▼ shows which). Stage sorts in flow order (New → … → Won, Lost); Value by the amount as entered. Sorting works with the search, filters and paging.

### Changed — Sales: "Offer Released" is now "Offer"

- The stage where the offer is priced and its document added is now called **Offer** — the offer is only released when it is marked sent, which moves the enquiry on to Follow-up. Renamed everywhere it shows: stage badges, the Kanban, filters, emails and notifications, the Sales dashboard and the MIS reports. Only the name changed: enquiries, gates and history are as before (no database change).

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
