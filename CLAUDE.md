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
