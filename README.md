# Mornward

A one-minute morning ritual before the feed. Native iOS and Android app (Capacitor) with a React, TypeScript and Tailwind UI in the **Daybreak** design: the sky is the progress bar.

Tonight: pick up to 3 tiny tasks, seal a one-line pact, set a wake time, allow one local push. Morning: read the pact, hold the sun for 3 breaths, do the tasks for real and tick them, unseal one of 21 science cards, put the phone down.

No account. No blocker. No alarm. **Anonymous privacy-first counts only (no PII, no accounts, opt-out switch included).** Tasks, the pact and times stay on the phone (`mornward.daybreak.v1`, device Preferences + `localStorage`); notifications are local. A few anonymous counts (opened, evening set, sun held, morning completed with streak and total, card opened) go to Supabase after consent, and can be turned off on Welcome or under Privacy and counts. Details: `public/terms.html`, `supabase/METRICS.md`. Android declares INTERNET for these counts only.

## Screens (flow order)

`Welcome` (new users only) → `OnbPlan` → `OnbPact` → `OnbHook` → `OnbSleep` → `Wake` → `Breathe` → `Act` → `Down` → `Rest` (See you tonight, then Plan tomorrow's morning) (`src/screens/`). On `OnbHook` the wake time is set by dragging the sun along the arc (5:00 to 10:00 AM, 15 minute steps) or with the − and + buttons.

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # typecheck, contrast check, build, Playwright
npm run test:contrast  # WCAG AA check of every text pair (src/tokens.json)
```

## Native

```bash
npm run ios       # build, cap sync, open Xcode (needs a Mac)
npm run android   # build, cap sync, open Android Studio
```

Plugins: `@capacitor/local-notifications` (two repeating daily notifications: morning at the wake time, default 7:00 AM, and an evening prep reminder, default 9:00 PM; permission asked only from the OnbHook toggle), `@capacitor/preferences` (durable state, mirrored to localStorage), `@capacitor/haptics`, `@capacitor/app`. Tapping the morning notification opens `Wake`; the evening one opens Evening Setup.

iOS bundle id `app.mornward`, display name Mornward. On a Mac: `npm ci && npm run ios` (build, `cap sync ios`, open Xcode), pick a signing team under Signing & Capabilities, run on a device.

### Open in Xcode with no npm and no CocoaPods

The iOS project uses Swift Package Manager and is committed ready to open:

1. Open `ios/App/App.xcodeproj` in Xcode (15 or later). On first open it downloads the Capacitor package from GitHub, so it needs internet.
2. Under Signing & Capabilities pick your team, choose your iPhone, press Run.

What makes that work without npm: the built web app is committed in `ios/App/App/public`, the Capacitor config in `ios/App/App/capacitor.config.json`, and the four plugin Swift packages in `ios/App/LocalPackages/` (copied there by `scripts/vendor-ios-plugins.mjs`). After you change anything in `src/` or the plugins, run `npm run sync` on a machine with Node, then `git add -f ios/App/App/public ios/App/App/capacitor.config.json ios/App/App/config.xml ios/App/LocalPackages` and commit, or the Xcode build keeps the old web bundle.

Icons and splash come from `resources/` via `npx capacitor-assets generate` (re-render with `node resources/render.mjs`).

## Notes

- `supabase/` is the analytics backend: insert-only `events` table, payload checks, report views. Daybreak counts need `supabase/migrations/20261011000000_daybreak_counts.sql` (run it before shipping a build that sends new kinds). Reports: `daybreak_testers`, `daybreak_daily`, `daybreak_retention`. `tests/db/run.sh` runs the database tests on a local Postgres.
- Deploy: `.github/workflows/deploy.yml` builds with `npm ci && npm run build` and publishes `dist/` to GitHub Pages on every push to `main` (repo Settings → Pages → Source: GitHub Actions). `public/CNAME` keeps the custom domain.
- iPhone: `index.html` has `viewport-fit=cover` and the Apple web-app tags, `public/manifest.webmanifest` is standalone, and every screen pads by `env(safe-area-inset-top|bottom)`.
- `public/sw.js` is a retired kill-switch: browsers that still hold the old PWA service worker fetch it, clear every cache and unregister. `src/lib/retire-sw.ts` does the same on every launch.
- Design source of truth: `src/tokens.json` and the Daybreak handoff. Night is `#2B2A6B`.
