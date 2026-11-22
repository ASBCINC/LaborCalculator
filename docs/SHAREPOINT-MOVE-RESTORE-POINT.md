# SharePoint move: restore point and how to undo it

Started 2026-11-22. Goal: move the labor calculator's data from Firebase to Microsoft 365 (SharePoint Lists)
with company sign-in. Until the switch day, Firebase stays the live database and nothing reps use changes.

## Restore point (the setup before this work began)
- App: v8.22.0, GitHub `main` at commit `cc681cbec09fe5bd50cb9ee8a4b95135a8b17dfc` (2026-11-20).
- Data: Firebase project `asbc-calculator` (Firestore) is untouched and stays live.
  Daily copies are in the private repo `ASBCINC/LaborCalculator-backups` (one commit per night).
- Automations unchanged: D-Tools sync workflow, cron-job.org trigger, Cloudflare relay, scheduled Claude tasks.

## What this work adds (each piece can be removed on its own)
| Added | Where | How to remove |
|---|---|---|
| App registration "ASBC Labor Calculator" (client ID 0216d1fb-7f30-4c0b-8435-fc10a9418191), delegated Graph permissions User.Read + Sites.ReadWrite.All | Azure portal > App registrations | Open it > Delete (recoverable for 30 days under Deleted applications) |
| `sp-test.html` (one-time connection test, not linked from the app) | this repo | Delete the file and push |
| List "LaborCalc Connection Test" | SharePoint site ASBC Projects | Use the test page's Delete button, or Site contents > ... > Delete |
| Future: SharePoint lists for quotes, catalog, users, settings | ASBC Projects site | Delete the lists (site recycle bin keeps them 93 days) |
| Future: app code that reads/writes SharePoint | this repo, behind a switch | `python3 scripts/release.py rollback 8.22.0 <new version>`, or revert the commits in GitHub Desktop |

## Full undo (back to exactly the restore point)
1. App code: `python3 scripts/release.py rollback 8.22.0 <next version>` then commit and push (or revert the SharePoint commits).
2. Delete `sp-test.html` and any SharePoint lists created for the calculator.
3. Delete the "ASBC Labor Calculator" app registration in the Azure portal.
4. Firebase was never changed, so the calculator keeps working on its existing data throughout.
