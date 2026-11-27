# ASBC Labor Calculator: operating guide for Claude

Owner: Anthony Ward. Live app: https://asbcinc.github.io/LaborCalculator/ (GitHub Pages, auto-deploys from `main`).
Adapted from Fo's Nov 16, 2026 handoff, with the release routine changed to use less usage.

## How changes ship (current setup)
Claude edits the local clone on Anthony's Work PC (`OneDrive - ASBISC ENTERPRISES PLC\Documents\GitHub\LaborCalculator`).
Cowork cannot push to GitHub, so **Anthony pushes with GitHub Desktop**. If Claude Code on the web gets GitHub
access later, the same routine applies, except Claude commits and pushes itself.

## Release routine (every change)
Version numbers (Anthony's rule, Nov 22, 2026): MAJOR.MINOR.PATCH.
- MAJOR (1st digit): major changes — new sections/pages that change how people use the app, security or sign-in changes, data model changes, anything that changes everyday workflow.
- MINOR (2nd): new features and upgrades within the existing app (reset PATCH to 0).
- PATCH (3rd): bug fixes and logic corrections only.

1. `python3 scripts/release.py check`: confirms local = GitHub `main` and shows live version. If not in sync,
   Anthony clicks **Fetch origin → Pull** first. Never edit a stale copy.
2. Locate code with `grep -n`, then read only the needed line ranges. **Never read the whole index.html** (~2,550 lines).
3. Edit in place with a short python read-modify-write (bytes in/out; files use CRLF line endings).
4. `python3 scripts/release.py bump X.Y.Z`: bumps APP_VERSION, BUILD_DATE and the sw.js cache name together.
   Skipping the cache name means devices keep the old app.
5. `python3 scripts/release.py lint`: syntax-checks inline JS and the modal-before-script rule. Must say `ok`.
6. Give Anthony a one-line commit message `vX.Y.Z: short description` and show what changed in a few lines.
   He commits to main and clicks **Push origin** in GitHub Desktop.
7. `python3 scripts/release.py verify X.Y.Z`: waits for the Pages deploy of that commit. Only then report it as live.
8. Remind him: tablet = triple-tap the ASBC logo; phone/laptop = hard refresh.

## Rollback (if a release breaks something)
Fast: `python3 scripts/release.py rollback <good> <new>` restores app files from the good version as a NEW version
(so tablets refresh), then Anthony commits `v<new>: rollback to v<good>` and pushes. Alternative: GitHub Desktop >
History > right-click the bad release > Revert changes in commit > Push. Then bump the version so devices pick it up.

Usage rules: no full-file reads, no screenshots unless the change is purely visual (then one, at reduced scale);
check behavior in the browser pane only when a change can't be verified from the code, using page text not images.
When Anthony sends several changes in a row, offer to ship them as one version.
Note: github.io itself is blocked from Claude's shells; verify uses the GitHub API + raw.githubusercontent.com.

## Files
`index.html` (whole app: HTML/CSS/JS), `log.html` (Quote Log), `sw.js` (service worker), `manifest.json` + icons,
`labor-catalog.json` (offline catalog fallback, STALE: 95 items vs ~92 live), `scripts/sync_opportunities.py` +
`.github/workflows/sync-opportunities.yml` (D-Tools sync; writes only changed opportunities + `config/sync`), `scripts/release.py`
(this routine), `scripts/fs.py` (Firestore helper; service account via secret FIREBASE_SA), `scripts/backup_firestore.py` +
`.github/workflows/nightly-backup.yml` (nightly copy of config/quotes/opportunities to the PRIVATE repo
ASBCINC/LaborCalculator-backups via secret BACKUP_TOKEN; also refreshes labor-catalog.json, so Pull before editing), `demo/` (demo copy).
Data restore: each day is a commit in LaborCalculator-backups (data/*.json); restore by writing docs back with scripts/fs.py.

## Settled business rules
- PRICING (v8.12.0) lives in `pricing.js`, shared by index.html and log.html (keep them in agreement): labor = billed hours x rate;
  billed = catalog hours + site conditions (Moderate/Difficult % on INSTALL hours) + project management % + commissioning %
  (min hrs), floored at the minimum hours; + 5% materials (on labor) + trip charge + recycling (none on an empty quote).
  All values admin-editable in Global Pricing (config/settings). Quotes saved before v8.12 (options.pricingV != 2) keep old math
  until someone taps "Use current pricing". The "Project Management" catalog category is hidden (PM is automatic).
- Materials fee fixed at 5% of base labor (`MATERIALS_MARKUP_PCT`), no dropdown/admin input; row under the hours lines,
  shows $ and "(automatically added to quote)", hidden at $0. He has changed this several times; just do what he asks.
- Total Estimate shows in the sticky summary and printed SOW. Recycling: changeable, default Yes, +$75.
- Labor rate $200/hr (config/settings, admin-editable), shown in the print disclaimer.
- Sales rep is a required dropdown (15 reps, fixed order in code); saving blocked until chosen.
- Spaces dropdown fed by 16 zonePresets in config/settings; first option "Select room for items"; room required
  before adding/changing items; no custom-room button (old custom lines still restore). "General" = legacy display only.
- Field labeled "Opportunity name" but Firestore key stays `customerName`.
- Printed SOW has no signature lines; disclaimer stays.
- Quotes started from a D-Tools opportunity save `dtoolsOpportunityId`.

## Leaderboard (v8.13.0)
`leaderboard-core.js` (shared) + `leaderboard.html`. Tally docs: `stats/<YYYY-MM>` {reps:{name:{quotes,total}}} and
`stats/quotedOpps` {opps:{oppId:{rep,at}}}. A quote counts once: first save, >=1 item, not a template, one per D-Tools opp (quote gets `counted`).
Stores: config/users store column, else STORE_DEFAULTS in leaderboard-core.js; store "none" = not ranked (Tom Virasak, president).
Reps see counts/coverage; only admin sees $. Admin "Rebuild tallies" backfills this + last month from saved quotes.

## Jobs / actuals (v8.14.0)
`jobs.html`. quote.status: draft > won (sync marks it when the D-Tools opp is Won, or admin) > scheduled (admin sets
quote.schedule {dates, techs[emails]}) > submitted (tech: quote.job {lines[{i,id,zone,actualHours,note}], log[{date,who,hours}], recap{work,issues,followups,client}})
> closed (admin approves; writes quote.actuals in the Labor Calibration format). Techs (role "tech": Eugene Fujimoto, Joseph Upperman,
Ivan Alecio, Mina Sedhom) never see prices or estimated hours; only Anthony assigns. Report prints to PDF via the browser.

## Score + weekly report (v8.17.0)
Leaderboard score = 10/quote + accuracy pts on approved jobs (|act-est|/est <=10% -> 10, <=25% -> 5), tallied in stats/<month>
{jobs, accPts, est, act} by `ASBCBoard.recordAccuracy` at approval. `weekly-report.yml` (Fri ~4-5 AM PT) runs scripts/weekly_report.py
-> doc reports/<secret REPORT_ID> {json}: last-7-day job recaps, 90-day accuracy by rep/item, month leaderboard. The Friday
"ASBC Friday pipeline meeting sheet" scheduled task reads it by URL. When Firestore is locked, rules must still allow GET
(not list) on reports/{id}.

## Data layer (Firebase Firestore only; the Google Sheet is a frozen archive)
- `config/catalog` and `config/settings` are SINGLE documents (read `d.fields.items`; not a collection).
- Catalog add-ons use `name|installHours|progHours;...`. Don't restructure without asking.
- Numbers: whole numbers come back as `integerValue`, decimals as `doubleValue`; always read both.
- `quotes`: one doc per quote, actuals merged in. `opportunities`: one doc per D-Tools GUID.
- Admin catalog editor writes straight to Firestore; Anthony edits it himself.
- Catalog load: localStorage cache → live Firestore → labor-catalog.json → frozen Sheet.
- Draft auto-save `asbcActiveDraft`; quotes older than 60 days are hidden from the Saved list but NOT deleted (since v8.9.16).

## D-Tools sync
Workflow every 15 min + manual run; secret `DTS_API_KEY` (created Nov 8, 2026). Needs BOTH X-API-Key and the public
Basic Authorization header; a bare 401 = header/secret problem. Upserts opportunities, deletes ones gone from D-Tools.
Quotes are read-only in the D-Tools API (can't push quotes). Check the sync only when asked or something looks wrong:
secret exists → recent runs (public API) → one manual call.

## Lessons already paid for
- Modal HTML must come BEFORE the main script (v8.7.0 blanked the app). Guard listeners.
- Recycling adds $75 even with 0 items (not gated; flag only if he reports an odd empty-quote total).
- New device install issues: delete the old shortcut, reinstall via the header Install button or Chrome menu.

## Bench (not committed)
Per-rep accuracy scoreboard on log.html; sync labor-catalog.json to the live catalog; gate recycling at 0 items;
D-Tools handoff panel (paste-ready labor block); Quote Log search wording.

## Customer sign-off (v8.20.0)
- signoff.html?quote=<id>: the assigned tech (or admin) opens it from the recap and hands the device to the client. 4 Yes/No questions (look, av, confident, issues), comments, acknowledgement, name, finger signature (600px PNG data URL).
- Saved as quotes/<id>.signoff {status:"signed", answers, issuesText, comments, name, signature, signedAt, collectedBy, concerns}. If no signature: job.signoffSkip {status:"not-present"|"declined", reason}.
- jobStatus "Complete" cannot be submitted without a signature or a skip reason. Reps can open the report (with signature) for their own jobs from the Quote Log ("Job report") or the email link.
- Sync job list + weekly report carry a signoff summary (no image); weekly report adds customerSignoffLast7Days.

## v8.21.0
- index.html: estimate panel compact sticky footer (total + buttons), Pricing details toggle (#pricingDetails, remembered), collapsible rooms, 60/40 split at lg (1024+) with Expand to 50/50, slide-up estimate below 1024, phone header/More menu/swipe categories/List default, PDF file name = opportunity name (setPrintTitle), Saved Quotes opens in same window.
- jobs.html: each item line and extra-work row records who did it (lines[].by / extras[].by: tech email, "*" = multiple); report shows a Who column.

## v8.24.0 (2026-11-22) mobile tech recap
- jobs.html recap is 4 steps (Time, Items/Extras, Recap, Photos & sign-off) with a sticky bottom bar, 16px fields, +/- quarter-hour steppers, autosave (1.2 s debounce).
- Submit runs checkJob(): must-fix = time log, job status, Work completed, sign-off/skip reason when Complete; please-check = item hours, photos. Shown in a slide-up sheet (sheet()); tapping an item jumps to the field.
- Edit & resubmit for the assigned tech or admin on Submitted AND Closed jobs. Edits autosave to quotes/<id>.jobDraft; Resubmit moves the old job into jobRevisions[], sets job.revision/changeSummary (diffJob), status back to submitted. Accuracy tally (ASBCBoard.recordAccuracy) only runs on the first approval (when quote.actuals is absent).
- "Other visits on this project" card: quotes with the same project.dtoolsOpportunityId.
- Relay Worker: Teams title "Job report updated (rev N)" + What changed (needs re-paste into Cloudflare).
- No approval step (v8.24.0): Submit/Resubmit sets status 'closed' (shown as SUBMITTED), saves quote.actuals via actualsFrom() and tallies estimate accuracy once. Legacy 'submitted' jobs show as 'Awaiting approval' and keep the admin Approve/Send back buttons.
- Duplicates allowed: the no-quote form no longer blocks a second report for the same opportunity; report view has '+ Another report for this project' (jobs.html?new=1&opp=&rep= prefills the form).

## v8.25.0 (2026-11-22) update button
- update-check.js (loaded by index.html and jobs.html): compares its ASBC_VERSION with the live sw.js cache name on open, on return to screen and every 30 min; shows a gold "Update available" pill. Tap: window.asbcBeforeUpdate() (jobs.html saves an open recap), clears caches, reloads. release.py bump now also updates ASBC_VERSION.
- sw.js fetches same-origin files with cache: no-cache (revalidates with GitHub Pages instead of its 10-minute cache).
- v8.24.1: Upload photos on the no-quote job report form (NEW.id picked when the form opens).

## v8.26.0 (2026-11-22) calendar
- calendar.html: month view of quotes with schedule.dates (role-filtered like the Jobs list). Team color from assigned techs first names: SF Team = Joseph, Eugene (orange); LA Team = Ivan, Mina (blue); both = split; else gray. Phones show color bars, tap a day for the list.
- Jobs > Schedule & assign has a time window (schedule.start / schedule.end, HH:MM) shown on the calendar and job header. Calendar links in the calculator header and Jobs header.

## v8.27.0 (2026-11-22) security
- Email confirmation: index.html shows a "Confirm your email" gate (sendEmailVerification, continue URL = app) until the account email is verified; other pages treat unverified as signed out.
- firestore.rules (in repo, deployed by pasting into Firebase console > Firestore > Rules): reads/writes only for verified + approved (config/users) accounts; config writes admin-only; opportunities read-only (sync service account writes); reports/<id> get-by-id public for the Friday sheet (no list); pipeline/** admin read; everything else closed. Undo = console Rules history.
- Deploy order: app first (so people can confirm their email), then rules.
- Rules PUBLISHED 2026-11-22 (were fully open: allow read, write: if true). Verified: unauthenticated REST reads of quotes/users/catalog/opportunities = 403, reports/<id> get = 200, reports list = 403; signed-in admin app pages load.

## v8.28.0 (2026-11-22) admin pipeline
- pipeline.html (admins only; link in calculator header for admins): projects where Anthony is PM in 5 stage columns (NEW, PLANNING, SCHEDULED, IN PROGRESS incl. Delayed, INSTALLED) + open opportunities he is a resource on. Tap a card for money, payments, change orders, dates and its own activity feed. No separate feed or calendar.
- Data: Firestore pipeline/data, field json, written by scripts/sync_pipeline.py (workflow step after the opportunities sync, continue-on-error). Feed events built from diffs: stage, contract value, change orders, payments, new assignment, job reports (jobs.json). Detail calls only for records whose modifiedDate changed; GetOpportunity capped at 150 per run.
- scripts/dtools_links.json: project name -> numeric D-Tools id (Open in D-Tools link) + seed stageAt from the Claude dashboard. Add new projects numbers there when needed.
- Not yet: email/Teams/text items from the Claude tasks (would need a relay ingest endpoint).

## v8.29.0 (2026-11-22) navigation + roles
- home.html = landing page after sign-in (manifest start_url). index.html (sign-in lives there) redirects to home unless ?calc=1 or ?quote=. Tiles by role.
- roles.js: admin, director (Sales Director), manager (Sales Manager), lead (Team Lead), installer. config/users[email].access + legacy role/allQuotes kept in step (LEGACY map). Pages guard with ASBCRoles.can(access, page).
- users.html (admin): set role + leaderboard store per person; writes config/users. Old Approved users textbox in the calculator admin panel is hidden in favor of it.
- Rules: installers read/update only quotes whose schedule.techs has their email, create only with themselves on it, no delete, no stats read; pipeline readable by admin + sales director. Directors and managers have no job recaps (Teams "View report" links will show the no-access page for them).

## v8.30.0 — calculator header
- index.html uses the same dark header/nav as the other pages (#hdrNav .hnav; ids asbcLogo, versionNumber, data-rate-display, repTicker, installAppButton, userBadge kept).

## v8.31.0 — D-Tools schedule -> Install Calendar
- dtools-schedule.js exposes window.asbcImportSchedule(projects) (admin only), loaded by calendar.html. The hourly 'ASBC D-Tools pull (v2)' scheduled task runs it from the built-in browser with each PM project's D-Tools tasks.
- Maps task assignees to lead/installer emails, merges with hand-added dates/techs (schedule.dtoolsImport), hash-skips unchanged (schedule.dtoolsHash); never reopens or creates jobs for Installed/Completed projects; new jobs are job-dt-<dtoolsId>.
- sync_opportunities.py patches schedule with a per-field updateMask so the time window and import fields survive.

## v8.31.1 — calendar sync reads D-Tools calendar events
- The D-Tools pull now reads Events/GetEvents3 (via the signed-in D-Tools page in the built-in browser), one task entry per event day, so multi-day installs get every day. Dashboard dtasks were stale and had one date per task.
- asbcImportSchedule: optional task.end sets schedule.end; 00:00 times count as all-day. Don't pass numeric D-Tools ids as dtoolsId (pipeline ids are GUIDs); it resolves by name.

## v8.32.0 — whole D-Tools calendar -> jobs + calendar events
- The D-Tools pull sends EVERY GetEvents3 event (projectIds []) with desc/address and mine (Anthony is PM) to asbcImportSchedule.
- Matching a project to a labor quote: D-Tools GUID, project number, project name, or the client's name (label/customerName/dtoolsClientName). A real quote wins over a job-dt placeholder; an empty placeholder (no job/signoff) is deleted and the quote gets the D-Tools link fields.
- schedule.times[date] = {start,end} per day; schedule.notes (event descriptions), schedule.address, schedule.dtoolsEventIds. Calendar shows per-day windows ('All day' for D-Tools all-day events); hand-saving a different window in Schedule & assign deletes times.
- Events with no calculator job (other PMs, finished, no quote) go to config/dtoolsEvents {events, at}; calendar.html shows them dashed with a D-T tag, team color from assigned names, description in the agenda.
- jobs.html: header shows per-day windows, address (maps link) and D-Tools notes; a new report's time log starts with one row per scheduled day per assigned tech.

## v8.32.1 / v8.33.0 — QC pass + navigation, health, notifications
- nav.js: shared role-aware header nav (<nav id="asbcNav" data-page=…>; children with data-keep stay). Used on home, calendar, jobs, pipeline, leaderboard, log, users. index.html keeps its built-in #hdrNav.
- roles.js: window.ASBCTeams {ofNames, ofEmails} (SF = Joseph/Eugene, LA = Ivan/Mina).
- health.js: window.asbcHealth() -> {issues[]} (passed install days w/o report, scheduled w/o date, complete w/o sign-off, unlinked won jobs, rep names not in User Roles, reps w/o store, stale calendar sync / pipeline data). Home shows it to admins; the D-Tools pull posts it to the dashboard on Mondays.
- Home tiles show counts (installs next 7 days, reports due/upcoming, saved quotes, active projects, people).
- dtools-schedule.js: config/dtoolsEvents now holds ALL events (job id + crew names); project.dtoolsProjectName is the job title (calendar/jobs label); schedule changes POST relay /notify {kind:'schedule'}; window.asbcRecapNudge() POSTs {kind:'nudge'} for today's jobs with no report (once per day, quote.nudged).
- Relay /notify: admin-only (Firestore read with the caller's token + config/users role), Teams card to each tech in schedule.techs via TEAMS_HOOK.
- Pipeline: 'Next install' line + install rows in the detail sheet from config/dtoolsEvents; NOT SCHEDULED flag on In Progress/Scheduled projects with no future event.
- Jobs: titles by D-Tools project name (Quote: <label> underneath), per-day windows + team color in the list, Archive (?archive=1) for reports whose last day is 30+ days old.
- index.html: loading splash instead of the sign-in flash (#authGate.ready); sales rep dropdown adds Admin/Director/Manager names from config/users.
- Data fix Nov 22: quote rep names Matt -> Matthew Stachnik, Josh Silva Bang & Olufsen SF -> Josh Silva, Stephen Sandberg -> Stefn Sandberg.
- v8.33.1: schedule-change alert compares days/times/techs as plain text (Firestore map key order made the first v8.33.0 run send 'schedule changed' to Mina, Eugene and Joseph for Harlesden and Gillis though nothing changed).

## v9.0.0 — D-Tools Calendar (left menu) + holidays (first release under the MAJOR.MINOR.PATCH rule; marks the v8.27–v8.33 sign-in/security, roles and navigation overhaul)
- The pull reads the next 60 days (from 7 days back) with GetEvents3 (project installs: times, techs, address, notes, task status) and Catalog GlobalCalendar/getGlobalCalendar {typeIds:[1,2]} (the left-menu Calendar's Event + Project Task; 'meetings' = scheduled events like store work, pickups, holds), plus Settings/GetCompanyHolidays?year= (empty in D-Tools today). Same captured page headers work for both APIs.
- asbcImportSchedule(projects, {meetings, holidays}): meetings become config/dtoolsEvents events with kind 'event' (one per day, crew/techs from assignees); holidays saved as config/dtoolsEvents.holidays.
- calendar.html: US holidays built in (usHolidays: New Year's, MLK, Presidents', Memorial, Juneteenth, July 4, Labor, Veterans, Thanksgiving + day after, Christmas Eve/Day, NYE) plus D-Tools company holidays, teal label on the day; D-Tools scheduled events tagged EVT.

## v9.1.0 — Pipeline one-screen PM view
- pipeline.html rebuilt: fixed-height layout (100dvh; header, KPI strip, toolbar fixed; only columns/panels scroll; normal scroll under 900px). Tabs (keys 1–6, remembered in localStorage asbcPipeView): Needs action (work queue + next 2 days + requests not tied to a project), Board (stage columns), Stores (column per store), Active jobs (next 7 working days from config/dtoolsEvents + Not scheduled), Revenue (by store + by rep), Opportunities.
- Store = the rep's store in config/users (SF/PA/WH/CM, 'Store not set'). Store chips filter every view and the KPI strip.
- Revenue: To collect = contract − paid (active projects); Due 30 days = unpaid payment terms due ≤ today+30 incl. overdue; Weighted opps = total × probability (null = 0); Projected = to collect + weighted.
- Messages: pipeline/feed {items:[{id, project (D-Tools project name), date, source outlook|teams|sms|call|transcript, kind, title, detail, url}], at} written by window.asbcImportFeed (dtools-schedule.js, admin) from the D-Tools pull step 7e (copies the Claude dashboard feed, last 30 days). Rules: match /pipeline/feed allow write: if admin() (published Nov 22). Tiles show the 2 newest messages; action/blocker/deadline ≤21 days count as REQUESTS and feed Needs action.

## v9.2.0 — Calendar customer card
- calendar.html: clicking a job (desktop grid chip or any agenda row) opens a card (infoJob/infoEv): customer, address (maps link), appointment days + times, assigned crew + team, sales rep, notes; 'Open job report' only for roles with recaps. Phones: tap the day, then the job in the list.

## v9.3.0 — Crew conflicts, parts ready, prep + labor-quote Teams, learned hours, labor profit, punch list, proposal PDFs
- sync_pipeline.py: from REST Projects/GetProject (refetched once for every project via 'parts' not in old): pdfs[] + proposalPdf (accepted/Q- PDF first), parts {total, ready, known, notReady[], names[]} (ready = installStatus staged/delivered/installed/received or orderStatus received/in stock).
- dtools-schedule.js: import copies project.proposalPdf and quote.parts from pipeline/data; asbcPrepReminders() (7:37 run: rep Teams 2 days before first install day, Fri covers Mon, Thu covers Mon/next; quote.prepSent); asbcOppLaborCheck() (7:37 run: opps in Proposal/Customer Review with no labor quote → rep Teams, max 10/run, config/oppLabor.seen; first run is a silent baseline).
- Relay /notify kinds: schedule, nudge, prep (to the rep, with checklist + parts), opp (reads opportunities/<id>). Admin check via config/users role/access or env ADMIN_EMAIL (no hard-coded address). Deployed 06110db9.
- health.js: window.asbcConflicts(events, users) = same tech, same day, two different jobs/events with overlapping times (all-day = whole day); Home shows double-bookings and open punch-list items.
- calendar.html: ⚠ on double-booked chips + red banner; Crew week view (techs × days, hours = D-Tools window, all-day 8 h); customer card shows parts readiness and proposal PDF link.
- jobs.html: header shows proposal PDF + parts; submit builds quote.punch from Open items (one per line/bullet), punch card with tick-off (by/at); recordItemHours → stats/items {id: {n, qty, est, act, name}} once per job.
- index.html: learned-hours note on products with 3+ jobs and ≥20% off the catalog (real hrs/unit vs catalog); admin Apply scales install+programming hours (quarter-hour rounding) and saves the catalog.
- pipeline.html: PARTS NOT READY (install ≤7 days), PUNCH badges + queue items, crew double-bookings and proposals without labor quotes in Needs action, proposal PDFs/parts/punch in the detail sheet, Labor profit table on Revenue (quoted = catalog hours × settings.hourlyRate, cost = log hours × settings.crewCostRate, admin-editable).
- Nov 22: Anthony skipped the rep Teams message for proposals without a labor quote — asbcOppLaborCheck() is NOT run by the D-Tools pull (the Needs action list of proposals without labor quotes stays). Crew cost rate set to $100/hr per tech (config/settings.crewCostRate).

## v9.6.0 Ramp expenses (Nov 23, 2026)
- Ramp developer app "Labor Calculator" (client credentials; scopes transactions:read, receipts:read/write, memos:read/write, users:read). Keys only in Cloudflare secrets RAMP_CLIENT_ID / RAMP_CLIENT_SECRET.
- Relay POST /ramp: txns (non-admins only see their own card), attach (receipt upload + project title prepended to memo; existing memo kept), ping.
- ramp.js: job report "Add receipt" -> matches the tech's charge (same amount, -3..+5 days) -> attach; no charge yet -> rampPending doc (photo held) and the hourly admin sync (calendar load) matches it later. Sync also adds charges whose memo contains a job's D-Tools project name or its 5-digit project number. quote.expenses[] feeds Job profit on the pipeline Revenue tab.
- No Ramp webhook: the relay has no database write access of its own, so the sync rides the admin calendar load (no extra Claude usage).

## v9.7.0 Project Expenses page (Nov 23, 2026)
- expenses.html (admin + management; tile on Home, "Expenses" in nav More): every D-Tools project from pipeline/data with its expenses = quote.expenses (job receipts, memo-synced) + projectExpenses/{projectId} (added on the page). By person, by type, totals.
- Admin adds: "from my Ramp charges" (own card, last 60 days, unclaimed; sets memo + optional receipt via relay attach) or "not in Ramp" (manual: type, vendor, amount, date, paid by, note). ✕ removes from the project only (ids kept in ignored lists so the sync won't re-add).
- Ramp sync also files memo-coded charges for D-Tools projects with no calculator job into projectExpenses. Pipeline Job profit includes projectExpenses (matched by project name).

## v9.9.0 Not-staged warning to reps (Nov 23, 2026)
- sync_pipeline.py: parts.notStaged = products whose D-Tools installStatus isn't Staged/Delivered/Installed (one-time refetch adds it).
- asbcPrepReminders (7:37 pull, 2 days before the first install day) passes `unstaged`; relay prep card then titles "Products not staged in D-Tools — upcoming install" with a "Not staged" list and an ask to stage or tell Anthony. Relay deployed e4baab83.
- Sent by hand Nov 23: Tamura (Nawel Girma, 10 lines) and La Cuesta (Noel Salinas, 3 lines). Harlesden all Staged; Gillis installing today.

## v9.10.0 Completion alerts to store managers (Nov 23, 2026)
- Relay /recap: when a submitted job report has jobStatus "Complete", the same Teams card also goes to the store manager from config/settings.completionNotify (store -> email): San Francisco + Palo Alto -> Adam Ravenkamp (Planning & Operations Manager), West Hollywood -> Kristina Adamiya. Store = the rep's store in config/users; reps without one fall back to the crew (Joseph/Eugene = SF, Ivan/Mina = WeHo). Costa Mesa -> Kristina Adamiya (set Nov 23). Relay deployed dda495c7.

## v9.11.0 Job status -> D-Tools project stage (Nov 23, 2026)
- jobs.html queueStage() on every submitted report: quote.dtoolsStage {want, from, done:false}. Complete -> Completed (Anthony chose Completed, not Installed); In Progress -> In Progress; Sales/PM Follow up, Cancelled -> Delayed.
- dtools-schedule.js: asbcPendingStages() (skips already-at-stage, already Completed, not found) and asbcStagesDone(results) (3 tries).
- Applied by the D-Tools pull step 7f on the 7:37/12:37/5:37 runs from the signed-in D-Tools page: Completed = PUT Project/api/v1/Projects/MarkProjectAsCompleted?id=; others = POST Projects/UpdateProjectsOpenStage?ids=&stageId= (ids from Catalog/api/v1/Stages/GetProjectStages: In Progress 3072, Delayed 3302). Not test-written yet; first real run will confirm. Step 6a no longer uses recaps.

## v10.0.0 Recap form: project hours + product checklist (Nov 23, 2026) — MAJOR (workflow change)
- Time log is one row per day: {date, hours (on site), techs:[emails]}; labor hours = hours × techs (old per-tech rows {date, who, hours} still read; regrouped by day when edited). job.siteHours / job.laborHours saved on every save.
- No per-item hours any more (job.lines = []). actuals = {totalEstHours: catalog hours of the quote, totalActualHours: labor hours}; stats/items (learned item hours) gets no new data.
- Step 2 "Products": D-Tools product lines (quote.parts.items, from sync_pipeline parts.items -> asbcImportSchedule) with an Installed checkbox -> job.installedItems; "Mark all installed". Complete with unchecked products = soft warning.
- Report "Total time" card: days, hours on site, labor hours; admin/management also see quoted labor (est × hourlyRate) − crew cost (labor hrs × crewCostRate) = Revenue / Loss.
- Pipeline Job profit uses job.laborHours.

## v10.0.1 Calculator defaults (Nov 23, 2026)
- New quotes start with Trip charge = No, Recycling = No (config/settings.defaultRecyclingToggle set to "no"), Crew size = 2. Saved quotes keep their own values.

## v10.1.0 Multi-day recaps (Nov 24, 2026)
- Recap time log shows a row for every scheduled day (also when reopening a saved/submitted report), lists the scheduled days, "+ Add another day" button.
- Submitted report: "+ Log another day" opens edit with today added (resubmits as the next revision; techs/rep notified as a revision).

## v10.2.0 Time quoted vs time on site + bid points (Nov 24, 2026)
- Report card shows quoted hours vs actual labor hours (site hrs × techs), hrs over/under and %, verdict; no dollars on the report (pipeline Job profit unchanged).
- Rep bid points (leaderboard-core accuracyPoints): within ±10% = +10, 10%+ under quote = +5, 10–25% over = −5, >25% over = −10. Scored once when a report is submitted with status Complete (quote.accScored), so multi-day jobs score on the final total.

## v10.3.0 Calendar: D-Tools links, who is free, on-demand sync (Nov 24, 2026)
- Job/event cards: "Open in D-Tools" (pipeline/data project url, matched by project name; admin/management/director).
- "Crew / who is free" view: Free cells on open weekdays, a Free crews row (SF/LA team free when both techs are), next fully free day per team (90 days), date picker to jump weeks.
- "Sync from D-Tools" (admin): "ASBC sync" bookmarklet run on a signed-in d-tools.cloud page reads GetEvents3 + getGlobalCalendar + holidays (same as the pull, -7..+60 days), returns to calendar.html#dtsync=<json> (fragment only), page confirms (15-min freshness) and runs asbcRawToProjects + asbcImportSchedule. MINE keyed by pipeline project num (numeric D-Tools id) and GUID. No Claude usage. Tested the read side live: 8 items, 5 events, ~16 KB.
- v10.3.1: who-is-free counts US holidays too (Thanksgiving showed as free).

## v10.4.0 Tech debt: auto-deploys, retired jobs.enc, merged job-report steps (Nov 24, 2026)
- .github/workflows/deploy-infra.yml: on push to cloudflare/** or firestore.rules: scripts/deploy_rules.py publishes firestore.rules with FIREBASE_SA (needs "Firebase Rules Admin" role); wrangler deploys cloudflare/ (wrangler.toml: yellow-cloud-830a, keep_vars) when secret CLOUDFLARE_API_TOKEN exists. Stop editing the relay/rules by hand.
- sync-opportunities.yml no longer publishes jobs.enc; it deletes the old `data` branch. JOBS_KEY secret can be deleted. jobs.json is still written locally for sync_pipeline.py.
- D-Tools pull: old step 5 (decrypt jobs.enc hourly) retired; 7g uses asbcPendingTasks()/asbcTasksDone() (quote.dtoolsTasks.for = job.submittedAt) on the 3 daily runs. Existing closed reports were marked handled.
- v10.4.1: asbcPendingStages returns the numeric D-Tools project id (pipeline p.num); the first real stage change (Gillis, Sales Follow up -> Delayed) failed 400 with the GUID.

## v10.5.0 System test fixes (Nov 24, 2026)
- Old reports (no installedItems) say the checklist wasnt on the form instead of 0 of N installed.
- Leaderboard: Costa Mesa store added; only managers/directors listed (management like Tom Virasak no longer shows as a rep); rebuild scores only Complete/accScored jobs.
- Parts readiness = D-Tools install status Staged/Delivered/Installed only (In Stock no longer counts); parts.rule=staged forces one refetch.
- Quote Log calibration = per job quoted vs actual labor hours on finished jobs; D-Tools-created no-quote jobs hidden from the log unless searched.
- Ramp memo matching uses the client LAST name only.
- Calculator speed: index.html no longer loads the Tailwind CDN; it uses prebuilt ./tailwind.css (cached in sw.js). If you add NEW Tailwind classes to index.html/pricing.js/leaderboard-core.js/roles.js, rebuild it: cd tools/tailwind && npx tailwindcss@3 -c tailwind.config.js -i in.css -o ../../tailwind.css --minify (content = those 4 files; colors brandGold #C7A66A, bgDark #050505, bgPanel #0D0D0D, textMuted #929292). Classes missing from the build silently render unstyled.
- Labor coverage: sync_opportunities.py checks each open opp's D-Tools quote for labor/install SKUs (cached by modifiedDate, max 60 calls/run) into config/oppLaborSku. Leaderboard coverage counts only opps with labor (unknown = counted). Retail-only deals are excluded.
- v10.6.0 Install photos: taken in the app (Take photo -> phone camera, or Upload photos -> pick up to 30 from the phone, saved one at a time, shrunk with asbcRamp.shrink to ~1600px JPEG), saved through the relay POST /photo {action:put|del} into Workers KV namespace asbc-job-photos (binding PHOTOS in cloudflare/wrangler.toml). Served by GET /photo/<job id>/<uuid>.jpg (unguessable link). Job keeps job.photos.list [{k,at,by}] and saves the list the moment a photo is taken. Old jobs with photos.uploaded and no list used the Microsoft Forms link (OneDrive). Free plan: 1 GB, 1,000 saves/day.
- v10.6.0 Photos expire after 548 days (KV expirationTtl). KV key "usage" = {months:{YYYY-MM: bytes}, live, warnedAt}; months older than the keep window drop out; Teams warning to admin at 80% of 1 GB, max once a week. Metadata has size for delete accounting.
- v10.6.0 Teams job-report card shows up to 4 install photo thumbnails (ImageSet, tap for full size) plus "N more in the report".
- v10.6.0 Quote Log Load fix: index.html boot replaced ?quote= with a bare path before sign-in finished, so the Home redirect fired; it now leaves ?calc=1. Quote Log rows show Labor/Prog hour totals; detail table splits labor and programming hours per line with totals.
- v10.7.0 Export PDF on the job report (jobPdf in jobs.html): jsPDF 2.5.1 lazy-loaded from cdnjs; header facts, time on site, recap, products installed/not, extra work, sign-off + signature, photos 2 per row, page footers. Saves "<job> - Job Report.pdf" for attaching to the D-Tools project.
- v10.8.0 App error log: diag.js (on every page, before Firebase) logs script errors, failed loads ("Could not load"), offline-during-load, and Jobs/Calculator pages not ready after 10 s (slow, then late with real time) to Firestore clientLogs (approved users create own; admins read/delete). Max 6 per page view. Jobs/Calculator call ASBCDiag.stage/ready/fail. Users page > "App problems" shows the last 30 days and clears older entries. update-check.js sets window.ASBC_VERSION for it (keep that when bumping).
- v10.9.0 THE D-TOOLS CALENDAR IS THE TRUTH. dtools-schedule.js importSchedule: every project scheduled with a crew becomes a job (placeholder 'job-dt-<id>', counted 'dtools-schedule') unless install done; labor quote auto-attaches only on exact D-Tools id / number / project name (rank: scheduled first, then locked, then newest); client-name-only match -> job.quoteSuggest (Jobs page Needs attention: Attach / Not it -> quoteSuggestNo). Quote saved after techs reported on the placeholder -> items/options/laborQuote copied onto the placeholder, quote gets mergedInto + jobHidden. Future installs whose D-Tools events vanished (inside the imported date window) -> schedule.dtoolsMissing; empty placeholders hidden; cleared when events return. D-Tools "Scheduled Events" = company events, calendar only (purple, "COMPANY EVENT · NO LABOR").
- v10.9.0 Quoted hours: jobs.html quotedHrs(q) = calculator quote (install/prog split from catalog) else q.dtoolsLabor {install, prog} from sync_pipeline.py laborQ (D-Tools project items whose name/partNumber has INSTALL_SERVICE / SRV-PROG; hours = quantity × unitLaborTime/3600, QTY = hours). actuals store estSource/estInstall/estProg. Labor coverage (sync_opportunities labor_item) = exactly INSTALL_SERVICE|SRV-PROG (cache rule 'sku2').
- v10.9.0 Jobs page: installers get techList (Hi <name> · Today big cards with time, map link, crew, status chip and one big button; Needs your report; Coming up; Submitted; "Unscheduled / emergency visit" fallback at the bottom). Admin gets attentionCard (possible quote match, removed from D-Tools, unscheduled visits to add to D-Tools, no labor quoted within 14 days). No To Do items from the job system (Anthony, Nov 25). Unscheduled visits are flagged unscheduled:true.
- v10.9.1 sync_pipeline.py other_jobs_labor(): placeholder jobs (counted 'dtools-schedule') for projects Anthony is NOT PM on get dtoolsLabor (+ rep from GetProject.salesperson if missing) via Projects/GetProjects search by number/name; at most 8 per run; dtoolsLaborAt marks done (not-found retries next run).
- v10.9.2-3 Older proposals (being phased out) carry a "Labor (Flat Rate)" allowance or a "Bang & Olufsen Installation" product (part # Installation) in dollars: laborQ/dtoolsLabor.flat = price ÷ $200/hr (Anthony, Nov 25); counted as install hours and labelled "estimated from the old Labor (Flat Rate) line". laborQ v:2 forces a one-time refetch. Opportunity labor coverage also counts the flat-rate line (cache rule 'sku3').
- v10.9.4-5 Jobs from other PMs' projects (MS-Chat Troubleshoot, Nov 25): sync_pipeline.py other_jobs_labor() now fills files, proposalPdf, dtoolsOpportunityId, rep, dtoolsLabor and the parts checklist (job_parts) for every 'dtools-schedule' job, refreshed when the D-Tools project's modifiedDate changes (max 15 searches/run). Importer stores project.dtoolsNum (= D-Tools numeric project id from the calendar) and events carry pid; calendar builds the Open-in-D-Tools link from it (dtLink) when the project isn't in the pipeline. Importer also uses the job's stored dtoolsOpportunityId for exact quote matching.
- v10.9.6 Job header shows 'Quoted: X hrs from the labor quote / D-Tools proposal' (quoteLine) instead of 'Job report without a labor quote'; orange only when nothing is quoted.
- v10.9.7 Completed-job Teams message also goes to the store's director(s): config/users access 'director' with the same store as the job (skipped if already sent as rep/admin/manager). Extra store -> director(s) in config/settings.completionDirectors (Costa Mesa -> Troy Ikeda, Nov 25).
- v10.9.8 Client phone: sync_pipeline client_contact() copies only the primary D-Tools contact's name + mobile/phone to pipeline projects (clientContact) and to other PMs' jobs (project.clientContact); importer copies it onto jobs. Shown tap-to-call on the job header, the techs' Today cards and the calendar info card.
- v11.0.0 (in preview) ASBC Tools look, D-Tools style (Anthony, Nov 27): Option B blue sidebar (sidebar.js), Level A logo (tools-icon-*.png, tools-favicon.svg), app name "ASBC Tools". scripts/build_tools_look.py recolors by usage (background/text/border maps; @media print and Tailwind bracket classes untouched) and adds tools.css + sidebar.js (not on signoff.html). Preview: `python3 scripts/build_tools_look.py` -> next/ (served at /LaborCalculator/next/). Go live: `python3 scripts/build_tools_look.py --live`, then delete next/, bump to 11.0.0. Until then edit the ROOT files only and rebuild next/.
- v11.0.0 (preview) Role dashboards: alerts.js asbcDashboard({access,email,name,store,users}) -> {alerts, cards} per role (admin = health.js + Jobs needs-attention + app log; management/director = store client concerns, jobs >25% over, store stats; manager/rep = unstaged products 2 days out, no labor quoted, new reports, own stats + rank; installer/lead = missed reports, punch items, today/week/month). Only when window.ASBC_TOOLS (set by the build's head script): Home becomes the Dashboard; techs land on My Jobs, reps on the Calculator (sidebar Dashboard = home.html?dash=1); techs/reps see their alerts as a strip (asbcAlertStrip) at the top of their page.
- v10.9.9 iPhone stall fix (jobs.html quick()): first reads (users, catalog, tech job list, a job) wait 5 s on the SDK, then read over Firestore REST with the user's ID token (restDoc/restQuery); ASBCDiag stage '… (server fallback)' marks it in the error log. Writes still go through the SDK.

- v11.0.0 LIVE (Nov 27): ASBC Tools look converted in place with scripts/build_tools_look.py --live; next/ removed; icons replaced (icon-*.png = Level A); sw cache 'asbc-tools-v'; release.py bumps asbc-tools-v. The app files ARE the new look now: edit them directly (light palette: bg #F3F5F8, cards #FFFFFF, lines #E3E7EE, text #1F2937, muted #4B5563, accent blue #1F6FD1, sidebar #2F7FD1, primary green #14945C). Do NOT run the build script again (it would re-map colors).
- v11.1.0 User Roles sign-in status + Teams invite: scripts/auth_status.py (hourly in sync-opportunities.yml, FIREBASE_SA, cloud-platform scope, Identity Toolkit accounts:batchGet) writes config/authStatus {json:{email:{verified,created,lastLogin}}}. users.html shows ✓ Verified / Signed up, not verified / Not signed up yet; "Send Teams invite" calls relay POST /invite {email} (admins only, person must be on User Roles), then records config/invites[email]=time. Invite card: steps + warning that the email can take minutes, may be in Junk, from noreply@asbc-calculator.firebaseapp.com, subject "Verify your email for asbc-calculator".
- v11.1.1 @asbis.com work emails allowed everywhere @asbc.us was: sign-in (index.html), User Roles save, relay Teams recipients (job alerts, schedule, prep, invites).

## v11.2.0 — Design Center (2026-11-27)
- New page design.html (sidebar "Design Center", every role). Two sections: "Vendor design centers & forms" and "ASBC tools".
- Links live in Firestore config/designCenter {links:[{id, section:'vendor'|'tool', name, url, desc, cat}]}; everyone approved reads, admins add/edit/remove on the page (existing config/{doc} rule). Links must be https:// or ./page in this app.
- roles.js PAGES.design + 'design' in all six roles; sidebar.js LINKS/PAGE; sw.js CORE_ASSETS.

## v11.3.0 — Design Center links + four in-house tools (2026-11-27)
- design.html SEED list (SEED_V=1): ProjectorCentral, AVIXA DISCAS, SANUS MountFinder + HeightFinder, AXIS Site Designer, plus the four tools. Shown to everyone until an admin opens the page, which writes them once to config/designCenter (seedV). Bump SEED_V only to push new starter links.
- New browser-only tools (nothing saved): tool-wire.html (speaker gauge, 8/4 Ω + 70/100 V), tool-poe.html (PoE budget), tool-tv.html (size by viewing angle + mount height), tool-rack.html (RU, BTU/hr, circuit load, print). sidebar.js maps them to 'design'; sw.js caches them.

## v11.4.0 — Shade sheet, lighting count, IP/VLAN plan (2026-11-27)
- tool-shades.html: 3-point measurements (fractions OK), order size (inside = narrowest W / longest H; outside = widest W + 2×overlap, longest H + overlap), out-of-square and depth flags, schedule, CSV, print. Draft in localStorage 'asbc-shades-v1'.
- tool-lighting.html: room presets → dimmers/switches/companions/keypads/Picos, wall boxes by gang, >4-gang warning, CSV, print. localStorage 'asbc-lighting-v1'.
- tool-ip.html: VLANs + devices, Next free IP (skips gateway, DHCP, used), IP/MAC checks. Saves to quotes/{id}.ipPlan {vlans, devices, updatedAt, by} (installers only on their own jobs per rules). Without ?quote= it keeps a local draft and offers a job picker (&draft=1 carries the draft over).
- jobs.html: ipPlanCard on the recap, IP plan button in report actions, link in edit step 4 (new tab), "Network / IP plan" section in the PDF.
- design.html SEED_V=2 adds the three tools (seeds now carry v so removed older seeds don't come back).

## v11.4.1 — Lighting count by switch location (2026-11-27)
- tool-lighting.html now models rooms → switch locations → positions {l: label/engraving, d: D dimmer | S switch | F fan | C companion | K scene keypad | H shade keypad | P wall Pico | B blank}. Gang = positions. Flags >4-gang, unlabeled positions, companions with no matching load label. Switch schedule draws faceplates left to right; CSV is one row per position.
- Storage key asbc-lighting-v2; old v1 count-only drafts convert automatically (Load 1, Load 2… labels).

## v11.5.0 — Knowledge Center (2026-11-27)
- knowledge.html (sidebar "Knowledge Center", every role): drill-down Category › Sub-category › Product › manuals, breadcrumbs, #hash paths (back button works), global search. Categories fixed in CATS (Audio, Video, Network, Control, Lighting & Shading, Security, Racks & Power); sub-categories/products come from the data.
- Data: config/knowledgeCenter {items:[{id, cat, sub, product, title, url, kind, src}], seedV}; admins add/edit/remove on the page.
- Seed (SEED_V=1): 50 entries for the 45 B&O PDFs pulled from BeoWise (bogob2b.custhelp.com) into Anthony's OneDrive › Documents › B&O Install Manuals/{Speakers,Sound systems,TVs,Accessories}; urls are SharePoint webUrls, so readers need access to that folder.
- BeoWise rate-limits (HTTP 429) fast crawls; ~1.6 s between requests worked.

## v11.5.1 — Knowledge Center: vendor manuals (2026-11-27)
- knowledge.html SEED_V=2 adds 90 links to public manufacturer docs: UniFi (gateway, APs, Protect, Access), Ruckus, Access Networks, WattBox, Kaleidescape, Lutron (RadioRA 3, Pico, Sivoia QS, Triathlon, Palladiom, drapery), Origin Acoustics. Seeds carry v; only versions newer than the stored seedV are added, so admin removals stick.
- Vendor links point at the manufacturer's own pages/PDFs (always current); UniFi uses techspecs.ui.com pages (Installation Guide tab).

## v11.5.2 — Knowledge Center: more brands + ASBC Standards (2026-11-27)
- New top branch "ASBC Standards" (first in CATS): B&O Installation Standards SOP, install team policy, project lifecycle SOP + summary, D-Tools sales pipeline training, scope of work template, service authorization form, AV content server guidelines, van stock list (all OneDrive webUrls; readers need sharing).
- SEED_V=3 adds 72: Control4, Josh.ai, Basalte, Lutron HomeWorks, Sonos, MantelMount/SANUS, Samsung Frame, Screen Innovations/Stewart, AVPro Edge/Binary/madVR, Middle Atlantic, Leviton SMC, Cat6/T568B refs, links to ASBC tools (./tool-*.html).
- Items show "from <src>"; some are distributor/retailer-hosted copies (Basalte, Sonos, Middle Atlantic) and say so. okUrl accepts ./page links; ./ links open in the same tab.

## v11.6.0 — Product watch: manuals + labor tiles for new proposal products (2026-11-27)
- scripts/sync_opportunities.py (hourly): when it reads an open opportunity's quote that has a labor line, every product line (not labor/wire/fees/client-supplied) is keyed BRAND|MODEL. Unseen keys go to config/productWatch {json:{known,queue,done,ready}}. Labor-check rule bumped sku4→sku5 so every open proposal is scanned once; until then everything is recorded as known only (baseline, `ready` set when done).
- knowledge.html: window.asbcPW helpers (admin): queue(), catalog(), manualsFor(text), addManuals(list), addTile({category,name,installHours,programmingHours}) (skips existing id/name, hours rounded to 0.25, 0–40), finish(key, {manuals, tile, coveredBy, hours, note}) (transaction; done keeps last 100). Admin-only "New products from proposals" panel shows the last 8.
- Daily Claude scheduled task "ASBC new product manuals & labor" (7:40 PM PT, on the work computer's built-in browser, signed in as admin) processes up to 10 queued products. Tiles are added automatically (Anthony's choice); catalog editor's persistCatalog keeps them (only standard fields used).

## v11.7.0 — Labor Review (2026-11-27)
- labor-review.html (admin only; roles PAGES.laborreview, sidebar "Labor Review"). Reads submitted job reports (quotes status submitted/closed with job.laborHours, last 12 months). Per job: quoted hours (same rule as jobs.html quotedHrs: calculator items, else dtoolsLabor) vs actual labor minus job.extrasHours. Per tile: each job's actual is shared across its catalog lines in proportion to their quoted hours (D-Tools-only jobs count for overruns, not tiles).
- window.asbcLR.data(days) → {week, tiles (2+ jobs), overrunsYear, jobsYear, lastReview}; asbcLR.save({summary, overruns:[{id,label,est,act,ratio,cause,tileRelated}], suggestions:[{id,installHours,programmingHours,jobs,ratio,reason}]}) → config/laborReview {json}. Apply (with confirm) writes the tile's hours to config/catalog; Dismiss just marks it. Last 12 reviews kept in history.
- Weekly Claude scheduled task "ASBC weekly labor review" (Fridays 3:20 PM PT, work computer's built-in browser, admin session) writes the review. Suggestions only; nothing changes until Anthony taps Apply.

## v11.8.0 — Code split + smoke test (2026-11-27)
- **Calculator and Jobs code moved out of the HTML.** Edit `src/calculator/NN-*.js` (setup, estimates, catalog-ui, quote-cart, print-ui, auth, admin, drafts-share, events-actuals, boot) and `src/jobs/NN-*.js` (core, photos-pdf, shared, list, steps, job-view, wire, new-report, boot). `python3 scripts/release.py build` joins them in file-name order into `calculator.js` / `jobs-app.js` (the files the pages load, same global script as before, so no behavior change). `bump` builds automatically; `lint` fails if a built file is stale. Never edit the built files.
- Ordering rule: the bundle is ONE classic script, so function declarations are hoisted across the src files; top-level statements still run in file order (boot files last).
- CSS moved to `calculator.css` and `jobs.css` (edit directly). APP_VERSION/BUILD_DATE now live in src/calculator/01-setup.js; check/verify read calculator.js.
- **Smoke test** (.github/workflows/smoke-test.yml, every push): release.py lint + `node tests/smoke.js`, which opens 20 pages at desktop and phone size with a stand-in Firebase (tests/mock-firebase.js, fixture data inside smoke.js) and fails on any JS error or a page that never renders. Add new pages to PAGES in tests/smoke.js. Run locally: `npm i --no-save playwright && npx playwright install chromium && node tests/smoke.js`.

## v11.9.0 — Calculator visual cleanup (2026-11-27)
- The calculator no longer uses dark Tailwind class names repainted by tools.css. 410 class uses were renamed to honest light-theme classes defined in calculator.css: bg-page, bg-card, bg-soft, bg-go (green button), bg-scrim, text-ink, text-ink2, text-mute, text-on (white on green), text-accent, text-bad, text-good, border-line, border-accent, divide-line, shadow-bar, hover/focus helpers hv-tint, hv-go, hv-text-on, hv-text-accent, hv-border-accent, fc-border-accent, fc-ring-accent, ph-mute. The calculator block in tools.css was removed. Use these names for new calculator markup.
- Bugs this fixed (old overrides beat the page's own styles): the selected category chip now shows blue; the printed estimate's title, client and sales manager were white-on-white and are visible again; item quantities show on the printout. Print zone headers are light gray (were black). Totals use the app font with tabular numbers (were monospace). Old gold accents (scrollbar hover, qty focus ring) are now blue/gray.
- Verified with before/after screenshots (desktop, phone, list view, modals, print) and the smoke test.

## v11.10.0 Less dependence on the work computer (Nov 27, 2026)
- ASBC sync bookmark v2 (calendar.html DT_BOOKMARK): opens the app in a NEW tab (window.open at click, then navigated), import as before
  (hash v:2 carries o = D-Tools origin). After the import, calendar.html pushStages(): asbcPendingStages() -> confirm list -> postMessage
  {t:'asbc-stages', P} to window.opener (origin checked: https://*.d-tools.cloud); the bookmark (still running in the D-Tools tab,
  origin + source checked) makes the stage calls (same as old pull step 7f, max 10) and posts {t:'asbc-stages-done', R} back;
  asbcStagesDone(R). D-Tools sign-in headers never leave d-tools.cloud. Old bookmarks still import (v:1) but can't push stages.
  Tested end-to-end with Playwright (stubbed D-Tools + mock Firebase): import, confirm, MarkProjectAsCompleted, done.
- Installer task statuses are now set by Anthony by hand. asbcImportSchedule() calls taskCheck(projects): a report's task update is
  marked done when D-Tools shows the target status on the techs' task for that project. Job report (closed, admin): "Mark recap
  uploaded to D-Tools" (job.dtoolsUploaded {for: submittedAt}) and "Mark D-Tools task updated" (dtoolsTasks).
- window.asbcDtoolsTodo() -> [{project, url, jobs, need:[stage → X | installer task → X | upload job recap], recap}] (60 days);
  the evening Claude pull posts it to Anthony's Claude dashboard on Fridays.
- config/syncStatus {okAt, problem, problemAt, via}: importSchedule clears the problem; window.asbcSyncProblem(reason) records one
  (scheduled run signed out of D-Tools etc.). health.js shows it in the stale-calendar item.
- scripts/daily_alerts.py (hourly sync workflow step): sales-rep prep heads-up (weekdays from 7 AM PT), recap nudge (5-9 PM PT),
  stale-calendar Teams alert to the admin once a day (8 AM-6 PM, 26 h / 74 h Mondays; config/syncAlert.sent). Calls relay /notify
  with an OAuth token for FIREBASE_SA (scopes datastore + userinfo.email); relay saCaller() verifies it with Google tokeninfo
  (must be @asbc-calculator.iam.gserviceaccount.com). New relay kind 'admin' {title, text, url, button}.
- Claude "ASBC D-Tools pull (v2)" now runs once, weekdays 5:37 PM PT: connector pull, calendar import (backup to the bookmark),
  dashboard tasks/messages, Monday data check, Friday D-Tools update list. Old steps 7f/7g/8/10 retired.
- Nov 27: Anthony removed the Installed stage in D-Tools; projects only move to Delayed, In Progress or Completed (job-report rule).
  The Claude pull's old 6a/6b (Installed / 30-day Completed) are retired; nothing changes stages automatically except the bookmark's
  confirmed job-report changes.
- Phone/tablet (Chrome): Sync dialog has "Copy bookmark code" + steps (bookmark any page, edit URL; run by typing "ASBC sync" in the
  address bar on D-Tools). Phones block the bookmark's pop-up, so it falls back to same-tab import; waiting stage changes are then
  pushed from Sync dialog → "Push stage changes (n)": confirm, the app opens D-Tools (window.open keeps window.opener), Anthony runs
  the bookmark there, it says {t:'asbc-hello'} to the opener, gets {t:'asbc-ready', P} and replies {t:'asbc-stages-done', R}.
  Tested with Playwright (pop-up blocked path + push from the app).

## v11.11.0 Hourly D-Tools calendar from the Company Calendar Feed (Nov 27, 2026)
- D-Tools Settings → Company Profile → Company Calendar Feed (generated Nov 27; iCal link = GitHub secret DTOOLS_ICS; revoke /
  regenerate on that page). Contains project events (UID event-<id> = GetEvents3 id, so 'ev'+id matches the bookmark), meetings
  (meeting-<id>), standalone tasks (task-<id>, ignored like the bookmark). Has: project name, dates/times, "Assigned to", address.
  Lacks: task status, event notes, holidays, project ids -> scripts/feed_import.js carries them from config/dtoolsEvents (last
  bookmark / evening import) by event id / project name; unknown other-PM projects are looked up in the D-Tools API (DTS_API_KEY).
- Feed quirk: timed entries are UTC as if entered in US Eastern -> read back in FEED_TZ=America/New_York (09:00 entered = 14:00Z).
  Guard: if 3+ matching timed entries all shift by the same whole hours vs the last import, the run stops (config/feedStatus.problem).
- scripts/feed_import.js runs hourly in sync-opportunities.yml (6 AM-9 PM PT only, so no overnight tech messages): firebase-admin +
  vm-loads roles.js and dtools-schedule.js and calls asbcImportSchedule (currentUser.isService skips the admin-role check; relay
  notify gets the SA OAuth token). Writes config/feedStatus {at, ok, problem, summary}. --dry / --force for manual runs.
- tests/feed_test.js (runs in the smoke workflow): synthetic feed -> build() -> real importer in Node with the stand-in Firebase.
  Checked against the real feed on Nov 27: the same 10 install events and 3 meetings as the last bookmark import, same times.
