Paste into the app README (the one with "Deploy (GitHub Pages)"):
- Change the title to "# Day Rate beta 1.24".
- Add these two sections above "## Release notes", and these two lines at the top of the release notes list.

## Experiment review (beta 1.22)
When a 7-day experiment ends, its result card in Insights > Act asks what to do next: Keep doing it (starts another 7 days), Change it, Drop it, or Decide later. The choice is saved with the result in `META.expDone` and shown in the Past experiments line ("kept", "changed", "set aside"). Like the running experiment, it is not part of backups. Logic: `src/experiments.js`, tests: `tests/experiments.test.mjs`.

## Month view, jump to date, on this day (beta 1.23)
History has a fifth mode, Month: a Monday-first calendar grid coloured like the other views, with arrows to move between months (back to your first month, forward to this one), a Jump to date field, and an On this day card listing rated days on the same date in earlier years (up to 5, nearest first). Tapping a day opens it below the grid, where you can edit it or rate a past day. The result screen's memory line now also looks back more than one year ("This day 2 years ago"), then falls back to last month. Maths: `src/calendar.js`, tests: `tests/calendar.test.mjs`; drawing: `src/calendar-ui.js`. 29 February only matches leap years.

## Privacy lock (beta 1.24)
Data > Privacy lock sets a 4 to 6 digit PIN. The app locks after 5 minutes away (and when opened after that), and a plain cover hides its contents whenever the app goes to the background, so the app switcher shows only the name. It is a gate, not encryption: days stay stored as before, and backup and export files are not locked. The PIN is kept as a salted PBKDF2 hash in `META.lock`, never in backups and never sent to the server. After 5 wrong tries in a row there is a wait (15 s, doubling, up to 5 min); nothing is deleted. Forgot PIN on the lock screen offers a reset that removes the lock and keeps every day (a deliberate choice: weaker lock, no data loss). Changing or turning off the lock needs the current PIN. Sample mode still locks and cannot change the lock. A damaged lock record is ignored so it can never lock anyone out. Biometric unlock is not done yet. Logic: `src/lock.js` (tests: `tests/lock.test.mjs`); screens: `src/lock-ui.js`; browser tests: `tests/e2e/lock.py` (add it to the `e2e` script in package.json). Not tested on a real iPhone.

Release notes:
- 1.24: privacy lock (PIN).
- 1.23: Month view, jump to date, on this day.
- 1.22: experiment review (keep, change, drop).
- 1.21: weekly grade goal, suggested goals, average-week goal.
