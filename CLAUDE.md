# CLAUDE.md: Mornward (Daybreak)

React + TypeScript + Tailwind + Capacitor. See README.md for commands.

## Rules that must hold

1. **The sky is the progress bar.** Night `#2B2A6B` → plum `#6B3F7A` → coral `#E8735A` → morning `#FFE9A8` (`src/tokens.json`). Act: `step = round(done / total * 3)`.
2. **Breath Hold Guard** (`Breathe.tsx`, `MIN_HOLD_MS = 3200`): a breath counts only after a real 3.2 s hold. Early release: no count, "almost" + "Hold a little longer with your breath."
3. **Rising Sun Layering** (`Act.tsx`): sun in a `z-0 pointer-events-none` layer, content at `z-10`. Never put text under the sun.
4. **Anonymous privacy-first counts only (no PII, no accounts, opt-out switch included).** `src/lib/stats.ts` sends insert-only rows to Supabase (`events`): a random device ID, the day and numbers or yes/no flags (see `public/terms.html`). Never the tasks, the pact, the times or anything typed. Nothing is sent before consent (Welcome's button, or OK on the one-time notice for people who set up before counts existed) or after "Turn off" (Welcome, the notice, Privacy and counts on Rest). Each step is counted once per morning (`track` keys). New kinds need a migration first (`supabase/migrations/20261011000000_daybreak_counts.sql`); Android declares INTERNET for this only. Your own phones: open `?test=1` once. State key `mornward.daybreak.v1` is written to BOTH `@capacitor/preferences` (device disk) and `localStorage` (`src/lib/storage.ts`); `hydrate()` runs before the first render and the newer `savedAt` wins. Never persist before hydrate.
5. **Native push only**: two repeating daily local notifications (`@capacitor/local-notifications`, ids 700 morning and 701 evening, `schedule: { on: { hour, minute }, repeats: true }`). Nothing fires at set-up time; the app shows an "Alarm set" badge once the OS holds the triggers. No "Add to Home Screen" copy. Ask permission only from the OnbHook toggle, in two steps: our own "Let Mornward nudge you?" sheet first, and only on Continue the iOS system dialog (iOS asks once per install, so "Not now" must never burn it). Background re-syncs pass `ask = false`.
6. **WCAG AA**: `#C4BEE8` for night placeholders and subtitles, `#4A3A58` for weekday and source labels on `#FFE9A8`. Every new text pair goes in `scripts/contrast.mjs`.
7. No streak shaming, no invented numbers, no emoji, no exclamation marks. Every card in `src/lib/cards.ts` needs a real source.
8. Respect `prefers-reduced-motion`: movement stops, colours still change.
9. One screen, one thumb, one main action. No scrolling during the morning ritual (the deck is an opt-in sheet).
10. **Welcome** is the first screen for a new user (before Step 1 of 4) and uses its own type (Instrument Serif, Plus Jakarta Sans, JetBrains Mono) and a pre-dawn gradient. Keep stars out of the text area and re-run the contrast check if you change its colours.
11. **Wake time** lives in `store.ts` (`WAKE_MIN` 5:00 to `WAKE_MAX` 10:00, 15 minute steps). The sun slider, the +/- buttons and the arrow keys all call `actions.setWake`, so they never disagree.
12. **Day lifecycle** (`settle` in `store.ts`): from 6:00 PM the app opens on Evening Setup (plan, pact, hook) until `armedFor` is set by "Set my morning"; from 4:00 AM an armed morning opens on Wake; a finished morning goes Down, then Rest ("See you tonight"), whose primary action is "Plan tomorrow's morning". Rest never loops back to the card except through its secondary link.
13. **Native build**: `appId app.mornward`, `appName Mornward` (`capacitor.config.ts`). iOS is forced to a dark interface style in `Info.plist` so the status bar text stays light.
14. **Tap-first onboarding.** The Pact step (step 2) shows six tappable lines; typing is the optional "Write my own". Never open on an empty text box.
15. **Safe areas are tested, not guessed.** `e2e/safe-area.spec.ts` emulates the Dynamic Island and home indicator (and an iPhone SE) and fails if any text or button leaves the strip between them. New screens go in its list.
