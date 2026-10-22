# Day Rate beta 0.4

Static PWA. Files: index.html, insights.js, manifest.json, sw.js, icon-192.png, icon-512.png, apple-touch-icon.png.

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
Edit files, change CACHE name in sw.js (dayrate-v4 -> dayrate-v5), upload. Open the app: "Update ready" banner appears; tap it.

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
`node --test tests/insights.test.js` (Node 18+, no dependencies). The tests are not needed in the deployed site.
