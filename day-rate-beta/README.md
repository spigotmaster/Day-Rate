# Day Rate beta 0.2

Static PWA. Files: index.html, manifest.json, sw.js, icon-192.png, icon-512.png, apple-touch-icon.png.

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
Edit files, change CACHE name in sw.js (dayrate-v2 -> dayrate-v3), upload. Open the app: "Update ready" banner appears; tap it.

## Move data from another install
Old install: Data > Backup file. New install: Data > Import backup.

## Scoring
Each of Mood, Productivity, Connection is rated 1-10, then scored 0-5 against all-time min and max of that category: points = 5 * (rating - min) / (max - min). Total = sum, out of 15. Max = 5, min = 0. If max equals min (first day, identical ratings) the category gets 2.5. Scores are derived, never stored, so past days rescore when the range changes.
