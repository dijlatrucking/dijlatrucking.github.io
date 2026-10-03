# Dijla Trucking

- Truck Ops (owners only): https://dijlatrucking.github.io/
- Hiring page: https://dijlatrucking.github.io/jobs/

Static site on GitHub Pages. Data lives in Firebase (project dijla-trucking); only approved Google accounts can sign in.

## Who can sign in

The owner (dijlatrucking@gmail.com) is fixed in `firestore.rules`. Everyone else is on the team list (`team/{email}`), which only the owner changes, from Ops → Settings → Team. Anyone can sign in with Google and ask to join (`requests/{email}`); the owner approves or rejects it there. `tests/rules.test.mjs` checks the rules (runs in GitHub Actions).

## Papers

Rate cons and receipts scanned in Ops are kept with their load or expense, and each load has a Papers panel for BOLs,
PODs, lumpers and more. Each paper is a record in `files/{id}` plus its scan in `fileData/{id}_{n}` (photos shrunk;
PDFs split into ~700 KB parts, up to about 3.5 MB).

## Cloud storage and Google Drive backup

Settings → Cloud storage & backup shows roughly how much of Firestore's free 1 GB is used. `backup/DijlaOpsBackup.gs` is
an Apps Script deployed once from the Google account that keeps the backups. Ops sends only the signed-in person's
sign-in token and paper ids; the script reads everything from Firestore as that person (so only the team can back up).

A backup writes a Google Sheet (Loads, Expenses, Papers, Recurring, Applicants, Settings), one JSON snapshot,
and every paper not yet in Drive (Papers/YYYY-MM/…) to
Drive → "Dijla Ops Backups". When storage reaches half (512 MB) Ops runs it by itself, then checks each paper's Drive
copy (there, not in the trash, same size) and clears only the checked ones from Firestore. Cleared papers open from Drive.
Drive mirrors the app: deleting a paper (or the load/expense it belongs to) queues its Drive copy in `trash/{id}` in the same
write, and the script moves it to the Drive trash (30 days to recover); after any delete the Sheet and snapshot are
rewritten a few seconds later. (No report PDFs: the Sheet and snapshot hold the same data.)
