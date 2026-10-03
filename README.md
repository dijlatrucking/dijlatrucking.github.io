# Dijla Trucking

- Truck Ops (owners only): https://dijlatrucking.github.io/
- Hiring page: https://dijlatrucking.github.io/jobs/

Static site on GitHub Pages. Data lives in Firebase (project dijla-trucking); only approved Google accounts can sign in.

## Who can sign in

The owner (dijlatrucking@gmail.com) is fixed in `firestore.rules`. Everyone else is on the team list (`team/{email}`), which only the owner changes, from Ops → Settings → Team. `tests/rules.test.mjs` checks the rules (runs in GitHub Actions).

## Google Drive backup

`backup/DijlaOpsBackup.gs` is an Apps Script you deploy once from the Google account that should keep the backups
(setup steps are in the file and in Ops → Settings → Google Drive backup). Ops sends only the signed-in person's
sign-in token; the script reads the data from Firestore as that person (so only approved accounts can back up) and writes
a Google Sheet (Loads, Expenses, Recurring, Applicants, Settings) plus a daily JSON copy (kept 90 days) to
Drive → "Dijla Ops Backups". It runs by itself once a day when Ops is open, or with "Back up now".
