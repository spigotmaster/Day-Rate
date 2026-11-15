# Day Rate: Developer Guide (for AI agents)

Read this fully before changing anything. Follow the rules in sections 2 and 3 on every task.
Tags used below: **[AI]** you do it. **[HUMAN]** stop and ask the owner; do not guess or fake it. **[AI+HUMAN]** you prepare it, the owner approves or supplies something.

---

## 1. What this app is

A private daily-rating app. Each day the user rates **Mood, Productivity, Connection** (integers 1 to 10) and may add a note and tags. The app turns that into a score, history, trends, honest insights, and long-term achievements.

Current state (beta 1.24):
- Static PWA, vanilla JS, no build step, no backend, no accounts. Hosted on GitHub Pages.
- Files (beta 1.15): `index.html`, `styles.css`, `src/*.js` (ES modules, see README for the map), `insights.js` and `achievements.js` (pure engines, classic scripts), `sw.js` (cache name `dayrate-vNN`, precache list must include every file), `manifest.json`, icons, `tests/`.
- Storage: IndexedDB (database `dayrate`, keys `entries`, `meta`, `rev`, `backup-pre-vN`) plus a localStorage rollback copy under keys `dayrate:v1` (entries, keyed by `YYYY-MM-DD`: `{m,p,c,note,created,updated,tags?}`) and `dayrate:meta` (settings, achievement dates `ach`, `achInit`, `achNew`, `haptics`, `sound`, milestone flags).
- Backup JSON: `{version, entries, ach, checksum}`. Import validates and merges.
- UI: 6 icon tabs (Today, History, Trends, Insights, Achievements, Data). Label pill shows for 2.4 s on tab tap. Unlocks trigger a centred popup with synthesized fireworks and sound.
- Day rollover is at 4 am. Always use the app's `today()`, never `new Date()` directly, for "today".

## 2. Product principles (never break these)

1. **Private by default.** Data stays on the device unless the user opts in to something else. No tracking, no third-party scripts, no ads.
2. **Calm, no guilt.** No streak-loss messages, no "you missed it", no shaming. Achievements are only ever added, never taken away.
3. **Honest statistics.** Insights use plain, non-causal wording ("on walk days your Mood averaged 0.4 higher", never "walking improved your mood"). Show nothing until there is enough data. Label early results "preliminary".
4. **Raw ratings for thresholds.** Achievement and goal thresholds use raw 1 to 10 values. The 0 to 15 score is relative to the user's own range and must not be used for fixed targets.
5. **Never lose user data.** Every schema change needs a migration, a pre-migration backup, and a test.
6. **Accessible.** Contrast, focus states, screen-reader labels, reduced motion, large text. Colour is never the only signal.
7. **Not medical advice.** Never diagnose, never claim clinical effect. Keep a visible disclaimer once health-adjacent features are added.

## 3. Rules for every task

1. Work in a branch. One feature per change. Keep changes small.
2. Run `node --test tests/` before and after. Add tests for any new logic. New pure logic goes in its own file with no DOM access, so it can be tested in Node.
3. Bump the `CACHE` name in `sw.js` and add any new file to its `FILES` list on every release. Bump the version text in the UI and README.
4. Test in a real headless browser (Playwright) for UI work: no console errors, keyboard works, screenshot at 390x780 phone size, light and dark mode, reduced motion on and off.
5. Seed test data through `localStorage` keys above. Never ship test data.
6. Use `mkEl`/`textContent` for user text. Never `innerHTML` with user content (notes, tags).
7. Copy style: short, warm, plain. No exclamation spam. No jargon.
8. When a request is ambiguous or touches money, accounts, legal text, store listings, or privacy, stop and mark it **[HUMAN]**.
9. Update `README.md` with every user-visible change.
10. Finish each task by listing: what changed, how it was tested, what the owner must do next.

---

## 4. Roadmap

### Phase 0: Finish what is already requested (COMPLETE)
Done by the owner: weekly recap follows the viewed week (current week Monday to today, others full 7 days), delete today's entry with an "Are you sure?" check, delete and undo for past days, real-phone testing. The AI has not seen this code yet: **[HUMAN]** send the latest `index.html` before any step that edits it.

### Phase 1: Foundation (COMPLETE in beta 1.15, except Vite which is deferred on purpose)
1. **[DONE]** `index.html` split into `styles.css` and ES modules in `src/`. Verified by the unit, smoke, click-everything and storage test suites (see README).
2. **[DONE]** Schema versioning and migrations (`src/migrate.js`). Never deletes, quarantines bad records, keeps a pre-migration backup, refuses newer data.
3. **[DONE]** IndexedDB storage with localStorage rollback copy, revision check, and persistence request (`src/storage.js`, wired in `src/state.js`).
4. **[DEFERRED]** Vite build. Native modules already work on GitHub Pages without a build, and Vite could not be run or verified where this was built. Add it when minification, hashed filenames or TypeScript are wanted; the precache list in `sw.js` then needs generating at build time. ESLint and Prettier config exist for the new modules only: **[HUMAN]** run `npm install && npm run lint` once and report errors. The older split modules are brought under lint one file at a time.
5. **[AI+HUMAN]** CI is written (`.github/workflows/ci.yml`: unit tests, lint, all three e2e suites). **[HUMAN]** confirm the first GitHub Actions run is green.
6. **[DONE]** On-device error log with Data > Copy debug info.
7. **[DONE]** Update flow already existed (banner plus `skip` message); it now lives in `src/app.js`.
8. **[HUMAN]** Choose and register a domain name (optional but recommended before launch). Approve the app name.
9. **[HUMAN]** GitHub repo settings: branch protection, Pages deployment source.
10. **[HUMAN]** Check the live `sw.js`. The 1.14 zip contained an empty one.

### Phase 2: Core experience (everything works offline, no accounts)
Status audit (beta 1.16). Read this before picking a step; some items already exist in a basic form.
- **Already in the app:** fixed tag list (7 tags) on each day, expected values from an equation (`src/forecast.js`, replaced goals in 1.18; see FORECAST.md), 7-day experiments in Insights > Act, reminder as a calendar file (.ics), weekly recap (Monday to today for the current week), year heatmap, CSV export, JSON backup with undo-last-import, delete day with confirmation.
- **Added in 1.19:** real notifications (step 1). This is the first feature that talks to a server. The server stores only push address, reminder time, time zone and rated-day dates. Rule: never send ratings, notes or tags to it.
- **Added in 1.17:** onboarding intro with sample-data mode (step 12). Rule for future work: every new write path must check `status.demo`.
- **Added in 1.16:** search (step 5), month and year recap with share image (step 4), "on this day" is NOT done yet.
- **Not started:** custom tags (2), privacy lock (8), PDF export (9), CSV import (10), settings screen (11), onboarding and demo mode (12), achievements v2 (13), insights v2 (14), accessibility audit (15), localization (16).
Treat steps below as: **[DONE]**, **[PARTLY]** (basic version exists, extend it) or **[TODO]**.

1. **[DONE in 1.19, needs [HUMAN] deployment and phone test]** **Daily reminders.** Real push notifications: client in `src/notify.js` and `sw.js`, server template in `server/` (Cloudflare Worker + D1). Calendar reminder (.ics) kept as the fallback. **[HUMAN]** must follow `server/README.md` (accounts, keys, deploy, `src/config.js`) and test on a real iPhone (iOS 16.4+, Home Screen app) and Android. Opt-in, time picker, gentle wording. On web this needs notifications permission; on iOS it only works for installed PWAs and is limited. Do the best web version now; native version in Phase 5.
2. **[PARTLY]** **Tags and activities.** (Fixed 7 tags exist with a per-week count. Add user-defined tags, rename/merge, and per-tag insights.) Quick-pick chips (walk, gym, friends, work, sleep well). User-defined tags, rename and merge. Per-tag insights using the existing keyword/tag comparison logic, with minimum sample sizes.
3. **[DONE in 1.22]** **Goals and experiments.** (End-of-period review shipped: keep, change, drop, in `src/experiments.js`. Original notes follow.) (Goals were replaced by the expected-value equation in 1.18. 7-day experiments exist. Add the end-of-period review: keep, change, drop.) One active experiment at a time. Types: direction ("raise 14-day Connection average by 0.5"), practice ("walk 4 days a week"). End-of-period review: keep, change, or drop. No pass/fail language.
4. **[DONE in 1.16, extend later]** **Recaps.** (Weekly, monthly, yearly and share image done. Still missing: a longer "Year in Review" story with biggest change and per-tag highlights.) Weekly (Phase 0), monthly, yearly "Year in Review". Plain language, best and worst weekday, biggest change, achievements earned. A share-as-image button (all computed on-device).
5. **[DONE in 1.16]** **Search and filter** notes by text, tag, rating range, date range.
6. **[DONE in 1.23]** **Calendar views.** (Month grid, jump to date and "on this day" shipped in `src/calendar.js` and `src/calendar-ui.js`.) Month grid, year heatmap (exists), jump to date, "on this day" memories from past years.
7. **[AI]** **Backfill.** Add or edit past days with clear labelling so the data stays honest.
8. **[PARTLY, PIN done in 1.24]** **Privacy lock.** (PIN lock, auto-lock after 5 minutes away, cover in the app switcher and a reset that keeps days are done: `src/lock.js`, `src/lock-ui.js`. **[HUMAN]** test the cover on a real iPhone. Still to do: WebAuthn/biometric unlock, which needs a real phone to test.) Optional PIN and WebAuthn/biometric unlock. Blur app content in the app switcher.
9. **[PARTLY]** **Export.** (CSV and JSON exist.) CSV, JSON (existing), and a printable PDF summary the user can show a doctor or coach. Include charts and the plain-language insights.
10. **[AI]** **Import** from CSV with a column-mapping screen and a preview.
11. **[AI]** **Settings screen.** Theme (light/dark/auto, accent colour), haptics, sound, reminders, week start day, rollover hour, units, language.
12. **[DONE in 1.17]** **Onboarding.** 3 short screens: what the three ratings mean, how privacy works, how scoring works. Skippable. Sample "demo mode" with fake data that is clearly labelled and never mixed with real data.
13. **[AI]** **Achievements v2.** Add progress detail view per achievement, a "next up" suggestion, seasonal/yearly ones, and a share card for each unlock. Keep long-term focus and no streak-loss mechanics.
14. **[AI]** **Insights v2.** More comparisons (tag vs no tag, weekday effects, lag effects such as "day after a high Connection day"), confidence labels, and an "ask me later" state when data is thin. Every new insight needs a test and a plain-language caveat.
15. **[AI]** **Accessibility pass.** Screen reader labels on charts (text alternatives and data tables), focus order, minimum 44 px targets, dynamic text size, high-contrast theme, reduced motion everywhere.
16. **[AI]** **Localization.** Move all text to string files. Support date, number and week-start differences. Start with English plus the owner's chosen languages.
17. **[HUMAN]** Decide the list of target languages and supply or approve translations.
18. **[HUMAN]** Use the app daily for 2 to 4 weeks and report what feels annoying, wrong, or missing. Decide which features stay.

### Phase 3: Optional cloud (only if the owner wants multi-device)
1. **[HUMAN]** Decide: stay local-only, or add sync. If sync: choose the backend (e.g. Supabase, Firebase, Cloudflare, own server) and accept running costs and responsibility for user data.
2. **[AI]** Design **end-to-end encrypted sync**: encryption happens on the device (Web Crypto, key derived from a user passphrase), server only stores ciphertext. Conflict rule: merge per day by `updated` time. Add a recovery key flow and clear warnings that a lost passphrase means lost data.
3. **[AI]** Build sign-in (email magic link or passkeys), sync engine, offline queue, and a "last synced" indicator. Local-only mode must keep working forever.
4. **[HUMAN]** Create backend project, API keys, environment variables, domain/DNS, and email sender. Give the AI only the public config; never paste secret keys into code or chat.
5. **[AI]** Add account deletion that wipes server data, and "export everything".
6. **[HUMAN]** Write or approve the privacy policy and terms (use a lawyer or a reputable generator suitable for the countries you serve).
7. **[AI]** Optional cloud backup to the user's own storage (iCloud Drive/Google Drive via file picker) as a simpler alternative to full sync.

### Phase 4: Optional smart features (opt-in, privacy first)
1. **[AI]** Optional context data, each behind its own switch: weather (city-level only), moon/daylight hours, calendar busyness. Show them as optional columns in insights.
2. **[AI]** Optional health data (sleep, steps, heart rate) is only possible through native wrappers (Phase 5). Design the data model now so imported context values sit beside ratings.
3. **[AI]** Optional AI reflection ("summarise my month in plain words"). Default off. Prefer on-device processing. If it needs an API call: send only what the user selects, show exactly what will be sent, never store it on a server, and never give medical advice.
4. **[HUMAN]** Approve any feature that sends data off the device, and decide who pays for API usage.

### Phase 5: Native apps and distribution
1. **[AI]** Wrap the PWA with Capacitor for iOS and Android. Add native local notifications, haptics, biometric lock, home-screen widgets (today's score, quick-rate), Apple Health / Health Connect (opt-in), share sheet.
2. **[HUMAN]** Create Apple Developer account (paid, yearly) and Google Play Console account (one-time fee). Complete identity verification.
3. **[HUMAN]** Create app IDs, signing certificates and provisioning profiles. Add them to CI as secrets yourself.
4. **[AI]** Build release pipelines (Fastlane or GitHub Actions) that produce signed builds from tags.
5. **[HUMAN]** Write store listings or approve AI drafts: name, subtitle, description, keywords, screenshots (AI can produce them), icon, age rating, support URL, privacy policy URL, App Privacy / Data Safety answers.
6. **[AI+HUMAN]** TestFlight and Play internal testing: AI prepares builds and a tester guide, owner invites 10 to 30 testers and gathers feedback.
7. **[HUMAN]** Submit for review, respond to reviewer questions, handle rejections (AI can draft replies).
8. **[HUMAN]** Decide pricing: free, one-time purchase, subscription, or donation. If paid, set up store in-app purchases and tax details.
9. **[AI]** Implement the chosen purchase flow. Core tracking, history, backups, and exports must stay free and never be locked. Do not gate the user's own data.

### Phase 6: Quality, trust, and launch
1. **[AI]** Performance budget: first load under 1 s on mid-range phone, app under 300 KB gzipped (before native), smooth 60 fps animations. Test with 5 years of data (1,800 days) and 20,000 days for stress.
2. **[AI]** Full accessibility audit with automated tools (axe) plus a written manual checklist.
3. **[HUMAN]** Have at least two real people with screen readers or other assistive needs try the app, if possible.
4. **[AI]** Security review: Content Security Policy, no inline script after the module split, dependency audit, import validation fuzzing, XSS tests on notes and tags.
5. **[AI]** Add a short in-app "Help and FAQ" and a "What's new" screen.
6. **[HUMAN]** Set up a support email or form and decide response time.
7. **[HUMAN]** Optional privacy-friendly analytics decision: default is none. If wanted, choose a cookieless self-hosted tool and approve exactly what is counted.
8. **[AI]** Marketing site (one static page): what it is, privacy promise, screenshots, install instructions, link to policy.
9. **[HUMAN]** Approve branding, tone, screenshots and any claims on the site. Claims must match section 2, rule 7.
10. **[HUMAN]** Launch, collect feedback, decide the next cycle.

---

## 5. Human checkpoints summary

The owner must personally do or decide:
- Test on real phones (Phase 0, 2, 5).
- Daily use and feedback (Phase 2).
- Local-only vs sync, and backend choice and costs (Phase 3).
- Accounts, keys, certificates, DNS, secrets (Phases 1, 3, 5). Never ask the owner to paste secrets into chat; tell them where to add them.
- Legal text: privacy policy, terms, store privacy answers, disclaimers (Phases 3, 5).
- Developer accounts, fees, store submission and review replies (Phase 5).
- Pricing and monetisation (Phase 5).
- Any feature that sends data off the device (Phases 3, 4).
- Translations, branding, marketing claims, support (Phases 2, 6).

## 6. Definition of done for any feature

- Works offline. Works with 0 days, 1 day, 30 days, 1,000 days of data.
- Tests added and passing. Playwright smoke test passes with no console errors.
- Light, dark, reduced motion, large text, keyboard, and screen-reader labels checked.
- No data loss on update, import, or delete. Delete always asks for confirmation and offers undo.
- README, version, and service worker cache updated.
- Wording follows section 2. No guilt, no causal claims, no medical claims.
- Final message lists changes, tests run, and the next **[HUMAN]** action.
