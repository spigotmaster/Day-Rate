# Day Rate reminder server

Sends a "How was today?" notification at the time each person chose. It is tiny: one Cloudflare Worker, one SQLite table (D1), one cron trigger.
Notifications on a phone cannot be scheduled by a web app alone. A phone only wakes a web app when a push arrives, so something has to send it. This is that something.

## What it knows (and does not)
Stored per phone: the push address, the reminder time (HH:MM), the time zone, the last day it sent, and the last day the app said "already rated".
Never received: ratings, notes, tags, backups, or any other app data. Turning notifications off in the app deletes the row. Rows for phones that have not opened the app for 120 days are deleted automatically.
Update your privacy text to say this.

## Setup checklist
Steps marked **[HUMAN]** need your accounts or secrets. An AI assistant can prepare and explain them but must not ask you to paste a private key into chat.

1. **[HUMAN]** Create a free Cloudflare account (cloudflare.com). Check that the free plan still includes Workers, D1 and cron triggers.
2. **[HUMAN]** On your computer (Node 20+): `cd server && npx wrangler login`.
3. **[HUMAN]** Make the signing keys: `node server/generate-vapid.mjs`. It prints a PUBLIC key (safe to share) and a PRIVATE key (secret: never commit it, never paste it in chat).
4. **[HUMAN]** Create the database: `npx wrangler d1 create day-rate-reminders`. Copy the `database_id` it prints into `wrangler.toml`.
5. **[HUMAN]** Create the table: `npx wrangler d1 execute day-rate-reminders --remote --file=schema.sql`.
6. **[HUMAN]** Edit `wrangler.toml`: `ALLOWED_ORIGIN` (exactly where the app is hosted, like `https://your-name.github.io`, no trailing slash and no path), `VAPID_SUBJECT` (`mailto:` your address), `VAPID_PUBLIC` (the public key from step 3).
7. **[HUMAN]** Store the private key: `npx wrangler secret put VAPID_PRIVATE_JWK`, then paste the single line of JSON from step 3.
8. **[HUMAN]** Deploy: `npx wrangler deploy`. It prints your Worker address (`https://day-rate-reminders.<you>.workers.dev`). Open `<address>/health`: you should see `{"ok":true}`.
9. **[AI or HUMAN]** Put the address and the PUBLIC key in `src/config.js`, bump the cache number in `sw.js`, and upload the app again.
10. **[HUMAN]** Test on a real phone (see below). Nothing in this folder could be tested against real push services where it was written.

## Test on a real phone
- **iPhone (iOS 16.4 or later):** open the site in Safari, Share, Add to Home Screen, then open Day Rate from the Home Screen icon. Notifications do not work from a normal Safari tab.
- **Android:** Chrome works in a tab or installed.
- In the app: Data, Daily reminder, set a time two minutes ahead, Turn on notifications, Allow. Use Send a test notification to check your phone shows it. Then wait for the real one.
- Rate today, set a time two minutes ahead again, and check that no reminder arrives on a day you already rated.

## Notes and limits
- The cron runs every minute and a reminder is sent from the chosen time for up to 15 minutes, once per day.
- The app's day rolls over at 4 am, so reminders set between 00:00 and 04:00 count as belonging to the previous day. Pick an evening time.
- If a phone's push address changes, the app notices when it is next opened and asks the person to turn reminders on again.
- Only real browser push services are allowed as targets (Google, Apple, Mozilla, Microsoft), so the server cannot be used to send requests elsewhere. Only `ALLOWED_ORIGIN` may call it.
- Capacity is capped by `MAX_SUBS` (default 2000). One cron run reads every row, which is fine at this size.
- Tests: `node --test tests/server.test.mjs` runs the real SQL on SQLite and checks the signatures.
