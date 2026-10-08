# Mornward

A one-minute morning ritual before the feed. Native iOS and Android app (Capacitor) with a React, TypeScript and Tailwind UI in the **Daybreak** design: the sky is the progress bar.

Tonight: pick up to 3 tiny tasks, seal a one-line pact, set a wake time, allow one local push. Morning: read the pact, hold the sun for 3 breaths, do the tasks for real and tick them, unseal one of 21 science cards, put the phone down.

No account. No blocker. No alarm. **Nothing is sent anywhere**: state lives in `localStorage` (`mornward.daybreak.v1`), notifications are local, and the Android build declares no INTERNET permission.

## Screens (flow order)

`Welcome` (new users only) → `OnbPlan` → `OnbPact` → `OnbHook` → `OnbSleep` → `Wake` → `Breathe` → `Act` → `Down` (`src/screens/`). On `OnbHook` the wake time is set by dragging the sun along the arc (5:00 to 10:00 AM, 15 minute steps) or with the − and + buttons.

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

Plugins: `@capacitor/local-notifications` (one daily notification, id 700, at the wake time; default 7:00 AM; permission asked only from the OnbHook toggle), `@capacitor/haptics`, `@capacitor/app`. Tapping the notification opens `Wake`.

Icons and splash come from `resources/` via `npx capacitor-assets generate` (re-render with `node resources/render.mjs`).

## Notes

- `supabase/` and `tests/db/` are the old beta analytics backend, kept for reference. The app does not use them.
- Deploy: `.github/workflows/deploy.yml` builds with `npm ci && npm run build` and publishes `dist/` to GitHub Pages on every push to `main` (repo Settings → Pages → Source: GitHub Actions). `public/CNAME` keeps the custom domain.
- iPhone: `index.html` has `viewport-fit=cover` and the Apple web-app tags, `public/manifest.webmanifest` is standalone, and every screen pads by `env(safe-area-inset-top|bottom)`.
- `public/sw.js` is a retired kill-switch: browsers that still hold the old PWA service worker fetch it, clear every cache and unregister. `src/lib/retire-sw.ts` does the same on every launch.
- Design source of truth: `src/tokens.json` and the Daybreak handoff. Night is `#2B2A6B`.
