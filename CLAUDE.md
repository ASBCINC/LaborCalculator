# ASBC Labor Calculator: operating guide for Claude

Owner: Anthony Ward. Live app: https://asbcinc.github.io/LaborCalculator/ (GitHub Pages, auto-deploys from `main`).
Adapted from Fo's Nov 16, 2026 handoff, with the release routine changed to use less usage.

## How changes ship (current setup)
Claude edits the local clone on Anthony's Work PC (`OneDrive - ASBISC ENTERPRISES PLC\Documents\GitHub\LaborCalculator`).
Cowork cannot push to GitHub, so **Anthony pushes with GitHub Desktop**. If Claude Code on the web gets GitHub
access later, the same routine applies, except Claude commits and pushes itself.

## Release routine (every change)
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
