# Day Rate beta 1.16

Static PWA, no build step. Upload the whole folder structure (keep `src/` as a folder).
- `index.html` page markup, `styles.css` all styling
- `src/*.js` the app as ES modules: `util` (dom + dates), `state` (data, scoring, storage wiring), `nav`, `rate`, `result` (result, week recap, goals, delete), `history`, `trends`, `insights-ui`, `celebrate`, `ach-ui`, `data`, `app` (startup, update banner)
- `src/review.js` (pure search and recap maths), `src/review-ui.js` (History > Recap and Search screens)
- `src/storage.js` IndexedDB store with localStorage fallback, `src/migrate.js` schema versions and migrations, `src/errorlog.js` on-device error log
- `insights.js`, `achievements.js` pure calculation engines (classic scripts, loaded before the app)
- `manifest.json`, `sw.js`, icons
- Dev only (not needed on the site): `tests/`, `package.json`, `eslint.config.js`, `.github/`
Opening index.html by double-click no longer works (browsers block ES modules on file://). Use the deployed URL, or run `python3 -m http.server` in the folder and open http://localhost:8000.

## Deploy (GitHub Pages)
1. Create a repo (public). Upload all files to the repo root (index.html must sit in the root, not a subfolder).
2. Settings > Pages > Deploy from a branch > main / (root) > Save.
3. Wait ~1 min. URL: https://USERNAME.github.io/REPO/
4. On iPhone, open that URL in Safari. Share > Add to Home Screen. Open from the new icon.

## Rules
- URL is permanent. Data is stored per exact URL; moving or renaming the repo gives an empty app.
- Safari tab and Home Screen icon keep separate data. Add the icon first, then enter real days.
- Deleting the icon or clearing website data deletes entries. Use Data > Backup file regularly.
- Data lives only on the device. No sync, no server.

## Update
Edit files, change CACHE name in sw.js (dayrate-v26 -> dayrate-v27) and add any new file to its FILES list, upload. Open the app: "Update ready" banner appears; tap it.

## Move data from another install
Old install: Data > Backup file. New install: Data > Import backup.

## Scoring
Each of Mood, Productivity, Connection is rated 1-10, then scored 0-5 against all-time min and max of that category: points = 5 * (rating - min) / (max - min). Total = sum, out of 15. Max = 5, min = 0. If max equals min (first day, identical ratings) the category gets 2.5. Scores are derived, never stored, so past days rescore when the range changes.

## Insights (beta 0.4)
The Insights tab turns your ratings into three layers: Observe (what happened), Discover (what patterns exist) and Act (small optional experiments). Everything is calculated on the device from the stored ratings. No server, no AI service, no new data is stored.

- Code: `insights.js` holds all calculations as pure functions (no DOM, no storage). `index.html` only draws the results. Upload both files.
- Thresholds (editable in `CFG` at the top of insights.js): 7 rated days before any insight shows, 14 days with all three ratings before pattern insights show, 3 rated days inside a period before its average shows, 3 ratings per weekday before weekdays are compared. Findings built on fewer than 30 days are labelled Preliminary. These are sensible starting points, not statistical guarantees.
- Incomplete days: a day missing a rating still counts toward the averages of the ratings it has, but is left out of anything that needs all three (correlations, best days, day types, weekday rhythm).
- Day types are judged against your own average and spread (above or below by 0.4 standard deviations), never fixed cut-offs.
- Notes are scanned for a few everyday keywords (walk, gym, friends and similar) so Insights can compare days with and without them. This is optional and only appears with enough days on both sides.
- Wording avoids causal claims. Experiments are ideas to explore, not advice.

## Tests

## Achievements (beta 1.8)
Long-term milestones in their own tab (trophy icon). `achievements.js` holds every rule as pure functions; `index.html` only draws them.
- Uses raw 1-10 ratings, never the relative 0-15 score, so thresholds like "productivity 8+" never move.
- Most achievements have levels (I, II, III), e.g. Driven = productivity 8+ on 50 / 150 / 365 days. A level's date is the first day the target was reached.
- Earned dates are saved in `dayrate:meta` (`ach`), so editing old days never un-earns anything. They are included in backups and restored on import (only filling gaps).
- First launch of this version backfills everything you already qualify for silently, with real dates. Only new unlocks after that show a toast and a dot on the trophy.
- Streaks count consecutive calendar days. Weekday ones need 6+ of each weekday first. Monthly ones only count complete months with 15+ rated days.
- Add or tune an achievement: one `add(id, group, name, descFn, tiers, trackFn)` line in `achievements.js`.

## Navigation
Bottom bar is icons only. Tapping one shows its name in a pill at the top for ~2.4 s, then fades. Screen readers get the name from each button's aria-label.

## Tests
`node --test tests/achievements.test.js` (Node 18+, no dependencies).

## Celebrations (beta 1.9)
When a rating unlocks an achievement, a centred popup appears about 0.7 s after the result screen, with fireworks and a sound effect. Several unlocks at once queue up (Next / Nice!). Higher levels get bigger fireworks and a fuller fanfare.
- Sound is synthesized with the Web Audio API (no audio files): a fanfare plus launch whistles, bursts and crackle timed to each firework.
- Data > Settings has a Sound effects switch and a Preview celebration button. The iPhone silent switch mutes web audio.
- Reduced-motion setting: popup still appears, fireworks and bounce animation are skipped.
- Popup is a proper dialog: focus moves to the button, Escape closes it, tapping outside the card (after 0.7 s) goes to the next one.

## Weekly recap and deleting a day (beta 1.10)
- History: the recap card follows the week shown in the week strip. The current week covers Monday to today and is compared with the same days of the week before; every other week covers all 7 days. It still needs 3 rated days.
- Delete: "Delete this day's ratings" sits under Edit ratings on the result screen and in History. It asks first (Keep it / Yes, delete) and removes the ratings, note and tags for that day. Earned achievements and their dates are kept, as with editing.

## More achievements (beta 1.11)
Two new groups. Rules use raw ratings and calendar days, like the rest.
- Showing up: Habit Formed (days in a row rated, 7 / 30 / 100), Full Week (all 7 days of a Monday to Sunday week, 1 / 4 / 12), Full Month (every day of a calendar month, 1 / 3 / 6), Centurion (total days rated, 100 / 250 / 500 / 1000).
- Fun and calendar: Lucky Seven (7, 7, 7), Staircase (each rating one higher than the last), Fresh Start (a day rated on 1 January), Rough Patch Survivor (3+ days in a row averaging 4 or less, then a full week above your average from before them; needs 14 days of history first).
- Update behaviour: achievements added in a new version that you already qualify for (earned before today) are filled in quietly with their real dates, with no popups. Anything earned today celebrates as usual. Engine version is stored as `achV` in `dayrate:meta`.

## Daily goals (beta 1.12)
- Optional 1 to 10 goals for mood, productivity and connection, plus an Expect switch on the same card for what you think the day will be. Expectations show Spot on, Higher by N or Lower by N once rated. Set them with the - and + buttons on the first screen, before rating (Today) and after (result screen). Once the day is rated each goal shows Met, Beat by N or N short.
- Stored per date in `META.goals` (latest 200 days kept). Included in the backup file (restoring fills in goals you don't already have; older backups without goals still import). Deleting a day's ratings leaves its goals.

## Goal stats, expectations and birthday (beta 1.14)
- Insights > Observe: a Goals and expectations card for the chosen period (last 7 or 30 days): how often each goal was met, and how far ratings landed from expectations, with a "usually higher or lower" note once there are 5 expected days.
- Expectations are stored in `META.goals[date]` as `xm`, `xp`, `xc` beside the goals `m`, `p`, `c`, and are in the backup file.
- Data > Settings: Birthday. Only day and month are stored (`META.bday`, also in the backup). Fresh Start now counts a day rated on 1 January or on that birthday; `evaluate(entries, today, { bday })`.

## Storage, migrations, error log (beta 1.15)
- Data now lives in IndexedDB (browsers clear localStorage more eagerly). localStorage is still written on every save as a rollback copy.
- Startup order: load -> migrate -> adopt. IndexedDB wins unless localStorage has a higher revision (`dayrate:rev`), which covers a write that never finished. If the browser cleared localStorage, it is refilled from IndexedDB.
- First run copies existing localStorage data into IndexedDB and leaves the original in place.
- Schema version is `META.schema` (now 2). Migration 2 repairs ratings stored as text, tidies tags, fills missing timestamps, and moves invalid records to `META.quarantine` (never deletes). A copy of the data from before is kept in IndexedDB (`backup-pre-v2`) and in localStorage (`dayrate:premigrate`).
- Data saved by a newer app version opens read-only with a warning, so an old cached copy can never damage it.
- Nothing is written until stored data has finished loading, so an early tap cannot overwrite real data.
- Data > Troubleshooting: Copy debug info (version, schema, day count, recent errors; never ratings or notes) and Clear error log.

## Tests
- Unit: `node --test` (Node 20+, no installs). 44 tests: achievements, migrations, error log, search and recap maths.
- End to end (needs `pip install playwright && playwright install chromium`): `python3 tests/e2e/smoke.py .`, `explore.py .` (clicks every button in every tab), `storage.py .`, `review.py .`. Or `npm run e2e`.
- Run them before and after any refactor. They use only element ids and storage keys.

## History: Recap and Search (beta 1.16)
History now has four modes: Weeks, Year, Recap, Search.
- Recap: month or year, with arrows to move back. The current period runs up to today and is compared with the same number of days at the start of the previous period; a finished period is compared with the whole previous one. Shows averages per rating with change, best and lowest day, best weekday (only with 3+ days of every weekday and a real gap), longest run of rated days, most-tagged, achievements earned in that period, and for years a 12-month bar chart. Needs 5 rated days (month) or 14 (year).
- Save as image: draws a 1080x1350 PNG on the device (averages and best day only, never notes) and opens the share sheet, or downloads it where sharing files is not available.
- Search: words (all must match, in notes and tag names), tags (all must match), rating band (8+, 5 to 7, 4 or less) for one category or any, and date range. Tap a result to open that day in Weeks.
- All maths uses raw 1-10 ratings, in `src/review.js`.

## Release notes
- 1.16: History Recap (month and year, share image) and Search.
- 1.15: index.html split into modules and stylesheet; IndexedDB storage, migrations, error log; Troubleshooting card; service worker precache list covers the new files. The sw.js inside the 1.14 zip was an empty file; this release restores it. If the live site's sw.js is fine, keep your cache number higher than the live one.
