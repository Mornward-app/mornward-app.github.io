# Reliability and measurement audit (beta-5)

5 October 2026. Branch `redesign-one-intention`. Nothing has been merged, deployed or applied to production.

**Scope.** A reliability and measurement pass on the mini-task app and its Supabase stats. The product, the mini-task
experience and the privacy promises are unchanged. No spoken routine, evening note, alarm automation, time-saved
estimates, social features, payments or new visual theme.

**Labels used below**

- **Confirmed bug:** reproduced, or proven by a seeded test, before the fix.
- **Risk:** plausible, but not reproduced. Hardened anyway.
- **Already correct:** inspected, and a test now pins it.

## Summary

| # | Issue | What was found | Status |
| --- | --- | --- | --- |
| 1 | Skipping shown as progress | Confirmed bugs: a skip-everything morning filled the ring; edits after Finish sent `core_routine_completed`; a skipped run 2 was recorded as "saved" | Fixed, tested |
| 2 | Retention definitions | Confirmed: old `pass_rules`/`testers` problems; beta-4 views counted an accepted prompt as an install, picked the "first routine" by arrival order, used a window one day early, had no activation cohort or first-week frequency | Replaced with tested views |
| 3 | Duplicates and identity | Confirmed: the device ID went to Google inside calendar links and sat in copied links; a race in the send queue dropped new rows; no row-level ID to deduplicate | Fixed, tested end to end |
| 4 | Interruption | Mostly already correct. Risk: a breath could complete if the hide event was missed or the page opened in the background. Edit-after-Finish credited a day (see 1) | Hardened, tested |
| 5 | Local days | Already correct (one `dayKey`, whole-day arithmetic). Confirmed: the caption said "this week" for a rolling window | Caption fixed, tested |
| 6 | Task validation | Confirmed bugs: a typed " · " split one task into many and got past the 3-task limit; case-only duplicates were saved twice; the join could cut a task mid-word | Fixed, tested |
| 7 | Privacy choice | Already correct: nothing before Begin, the queue is emptied on opt-out, no backfill. Confirmed: terms overstated anonymity; deletion copy didn't separate phone vs server | Wording fixed, tested |
| 8 | Supabase access | Already correct: RLS, insert-only key, no reads. Confirmed: any free text could be stored in `data` | Payload check added, tested as `anon` |
| 9 | Calendar reminders | Confirmed: a new UID per download (duplicate events); copy promised alerts; Google ignores the link's alert time; nothing counted setup taps | Fixed, payload tests; delivery unverified |
| 10 | Preview, PWA | Already correct: preview sends nothing; real links in production. Risk: a slow network delayed opening with no fallback; terms not offline; install detection had no "installed" signal on Android | Hardened, tested in Chromium |

Before any fix, `tests/` plus a baseline reproduction against the previous `index.html` showed this:

```text
skip both → week summary: "14% 1 of 7 mornings this week"
breathe, skip tasks, then Add on the Finish screen → … routine_finished, intention_saved, core_routine_completed
run 2 skipped after run 1 saved → routine_finished {"breathing":"skipped","intention":"saved"}
typed "Walk · run · swim" + one chip → saved as 4 tasks
chip "Tidy one spot" + typed "TIDY ONE SPOT" → "Tidy one spot · Ten squats · TIDY ONE SPOT"
Google Calendar link query contains the device ID: true
add guide "Copy link" contains the device ID: true
two calendar files share a UID: false
queue race (send in flight, counts off and on, new routine): new routine_started lost, queue empty
```

## 1. Skipping everything was presented as progress

- **Found**
  - `renderFinish()` called `markDone()` on every Finish, so a morning with both steps skipped got a sun and moved
    the ring ("1 of 7 mornings, 14%").
  - The backend events were mostly right: `routine_finished` included skips, and core was sent only on a first save
    with breathing completed.
  - But a save from Edit after the Finish screen also counted as "first save", so it sent `intention_saved` and
    `core_routine_completed` after the routine had finished.
  - In a second run the same day, "Skip for today" recorded `intention: "saved"` because tasks existed from run 1.
- **Changed**
  - `routine.tasks` records only this run's task step.
  - `reachFinish()` records the end once per run (`finishedAt`). It sends `routine_finished` with `core` and `def: 2`,
    and sends `core_routine_completed` only if all three breaths were completed **and** tasks were saved in the task
    step.
  - Events renamed `tasks_saved` / `tasks_skipped` (beta-4 names still accepted). Edits send nothing.
  - The phone keeps `days` (reached the end) and `fullDays` (full routine).
  - The week strip shows a sun only for full days and a small mark for reached-the-end days. The caption says "N of
    the last 7 days · full routine: 3 breaths + mini tasks"; the ring is N ÷ 7.
- **Verified** (`tests/e2e/routine.test.js`)
  - Skip both: finished, core false, 0%, small mark.
  - Breathe and skip tasks: core false. Skip breathing and save: core false. Breathe and Keep these: core true, 14%,
    sun.
  - Edits after Finish send nothing. Run 2's skip is recorded as skipped. Opening the task screen confirms nothing.
- **Limitation**
  - A morning from before beta-5 shows as a small mark even if it was a full routine. The phone never recorded its
    steps, and they aren't guessed.
  - "Full routine" still says nothing about doing the tasks in real life (out of scope by design).

## 2. Retention metric definitions and eligibility

- **Found**
  - Old beta-2 views: `testers.first_day` is the first event of any kind, `pass_rules` divides by every device
    (test, recent and newer-version ones), and test traffic isn't removed. All three are confirmed by seeded asserts.
  - Beta-4 views (never applied to production):
    - `install_confirmed` counted an *accepted* Chrome prompt as an install.
    - The "first routine" was picked by server arrival order, which breaks when queued rows arrive late.
    - The D1 window was treated as complete one day before late rows stop being accepted.
    - There was no activation cohort, first-week frequency, or separation of beta-4's core definition.
- **Changed** (migration `20261005000000`)
  - Units: `routine_runs`, `routine_days` (one device-day), `routine_cohort`.
  - `routine_cohort`: an acquisition cohort (first routine, new devices only), an activation cohort (first full day),
    and exclusion reasons.
  - `retention_report`: each metric with numerator, denominator, pct, not-yet-eligible and its window rule.
  - Also `week1_frequency`, `report_exclusions`, `routine_daily`, and `legacy_retention_report` for the live beta-2
    data, kept apart.
  - Finality rule: day D is final when `current_date` ≥ D + 3.
  - Core counts only `def = 2`; beta-4 core is reported separately.
  - Definitions: `supabase/METRICS.md`.
- **Verified**
  - `tests/db/metrics_test.sql` seeds 16 devices: returners, a non-returner, two recent joiners, duplicate sessions
    and a row sent twice, a test device and an excluded device, an earlier-version user, a not-first device, a
    reminder-context device, late activation, beta-4 core, and beta-2 users.
  - It asserts exact counts for all 13 report rows, the cohort members, the exclusions, the frequency distribution,
    the daily counts and the 6 legacy rows.
  - It passes on a production-shaped database upgraded with both migrations, and on a fresh `setup.sql`.
- **Limitation**
  - Opening the app without tapping Begin sends nothing, so "active" means "started a routine".
  - Devices aren't people (see 3).
  - Self-selected beta testers in the tens can't support conclusions beyond direction.

## 3. Duplicate events and identity

- **Found**
  - The device ID is a random UUID in `localStorage`, kept across reloads.
  - Rows had no own ID; a lost reply could store a row twice (the views' `bool_or` hid it).
  - `flushStats` removed sent rows by count, so rows queued during a request, after an opt-out and opt-in, were
    dropped. Reproduced against the old code.
  - Links:
    - The Google Calendar link put the device ID into event text sent to Google.
    - Calendar files and the alarm Shortcut link carried it too.
    - The add guide's "Copy link" carried it, though no browser accepted it.
    - Two storages sharing an ID could produce colliding run numbers.
- **Changed**
  - Every queued row gets an `event_id`. A security-definer trigger skips an `event_id` already stored, and the
    unique index guarantees it.
  - `ON CONFLICT` wasn't usable: under RLS it needs a SELECT policy, which would let the public key read rows.
  - The queue removes rows by `event_id`. A rejected batch is retried row by row, so one bad row doesn't drop the
    others. 409 counts as stored.
  - Routines carry a random `rid`.
  - Links that leave the phone carry no ID. The iPhone icon's start address is the only continuity token: ID, terms
    version and counts choice only, and no ID when counts are off. Old links are still accepted when opened.
- **Verified**
  - `tests/e2e/ingest.test.js` drives the real app through PostgREST 12 into the dev database: a lost reply, a retry
    and four reloads give each step stored once. Two routines on one day are 2 routines, 1 day. Beta-2/beta-4 queued
    rows are stored with new IDs, and a free-text row is dropped without blocking them.
  - `tests/db/security_test.sql` covers duplicates, including one repeated inside a batch.
  - `tests/e2e/privacy.test.js` covers the queue race and every link.
- **Limitation**
  - Same person, two storages (iPhone icon vs Safari, in-app browsers, reminder links opened elsewhere, cleared
    data): two devices. The icon carry isn't verified on a real iPhone.
  - A reminder-opened first routine is excluded from the acquisition cohort rather than linked.
  - Two tabs running a routine at once can overwrite each other's routine record. They keep separate `rid`s.

## 4. Routine and task state through interruptions

- **Found**
  - States were implicit but sound: breathing comes back paused after a reload, drafts and ticks are kept per day,
    the Finish screen survives reloads, and same-day reopens show Today.
  - Risk, not reproduced on a device: a breath could complete while hidden if `visibilitychange` was missed, or if
    the page started in the background.
  - Edit after Finish counted as a completion (see 1).
- **Changed**
  - States are documented in the code (ready / breathing / paused / task selection / finish pending / completed).
  - A breath never completes while `document.hidden`; that breath restarts on Resume.
  - Breathing pauses on `pagehide`, and starts paused if Begin runs in the background.
  - Save is guarded against double taps. Finish only moves to Today. Recording happens once per run.
- **Verified** (`tests/e2e/routine.test.js`)
  - Reload mid-breathing: paused on the right breath, nothing counted while waiting.
  - Hidden, with and without the hide event: nothing counted.
  - Reloads restore drafts and ticks. A reload on Finish sends nothing twice. Repeated Finish taps change nothing.
  - Edit cancel keeps the tasks. Same-day reopen shows Today.
  - Old routine records upgrade (`tests/e2e/pwa.test.js`).
- **Limitation**
  - Background behaviour is emulated (overridden `document.hidden`), not tested on iOS or Android.
  - Paused breathing restarts the current breath from "in", not mid-breath, after a reload.

## 5. Local day and time zones

- **Found**
  - Day logic is already central: `dayKey`, plus `addDays` with whole-day arithmetic.
  - Rows carry the local start date; `created_at` is UTC.
  - Preview date shifts are gated on `MORNWARD_PREVIEW`.
  - Confirmed: the week caption said "this week" for a rolling 7-day window.
- **Changed**
  - The strip is a documented rolling window ("the last 7 days").
  - The retention rule uses each device's local calendar with the D + 3 finality rule, documented in `METRICS.md`.
  - Today's tasks and history were already separate keys; this is now asserted.
- **Verified** (`tests/e2e/dates.test.js`, 22 checks)
  - Midnight, and the 3-hour carry-over.
  - 31 Dec → 1 Jan.
  - New York fall-back and spring-forward, including a routine spanning the repeated hour.
  - Bangkok → Los Angeles → Bangkok: no re-dating, no double credit.
  - A stored preview shift is ignored in production.
- **Limitation**
  - Travelling west can make the phone's "today" earlier than a day already done. That day keeps its credit but
    falls outside the strip until the calendar catches up.

## 6. Task validation and saving

- **Found**
  - Confirmed: a typed " · " (the separator) split one task into several. It got past the 3-task limit (4 saved in
    the baseline).
  - Confirmed: duplicates differing only in capitals were saved.
  - The 600-character join slice could cut text.
  - Already correct: empty and whitespace refused, read-back before success, draft kept on failure, no
    auto-confirm.
- **Changed**
  - One `normalizeTasks()` for routine and Edit: trims, turns "·" into ", ", NFC, 200 characters by code point (an
    emoji isn't split), case-insensitive dedupe keeping the first wording, at most 3 across chips and typed text.
  - Success is shown only after the read-back.
- **Verified** (`tests/e2e/routine.test.js`)
  - Zero tasks, whitespace only, a fourth chip, 3 chips + typed, capital-letter duplicates, separator, 260
    characters with an emoji at the limit.
  - Simulated storage failure: a message, still on the screen, words kept, nothing sent. A retry succeeds.
  - Edit cancel.
- **Limitation**
  - Dedupe is exact after case folding. "Walk" and "Walk." are two tasks.

## 7. Privacy choices control collection

- **Found**
  - Already correct:
    - Nothing is sent before Begin (consent at Begin).
    - The pre-Begin toggle works.
    - Opt-out empties both queues.
    - Nothing is queued while counts are off (no backfill).
    - Task text is never in telemetry (no error reporting exists).
    - Local tasks are separate from the preference.
  - Confirmed:
    - The terms said "without the ID there's no way to tell which records are yours, because nothing else
      identifies you" (overstated).
    - The delete-on-phone copy didn't say server counts stay.
    - Retention and deletion promises are manual SQL with no automation.
- **Changed**
  - Terms (beta-5):
    - "pseudonymous rather than fully anonymous";
    - per-record IDs;
    - reminder taps counted, never as a working reminder;
    - plain reminder links;
    - the iPhone icon token.
  - Delete copy separates the phone from Supabase.
  - `ANALYTICS.md`: requests and end-of-beta deletion are manual; reply only to the requester's address.
  - `TERMS_VERSION` → `beta-5` (people agree again at Begin).
- **Verified** (`tests/e2e/privacy.test.js`)
  - Zero requests before Begin.
  - Off from the start: no request, no ID.
  - Off with 4 rows queued while offline: queue emptied, nothing sent after reconnecting and another routine.
  - Back on: only new rows, not marked first.
  - Typed task text in no request body or URL.
- **Limitation**
  - Supabase's own request logs (IP, browser) are outside the app's control.
  - Deleting at the end of the beta depends on someone running the SQL.

## 8. Supabase access and ingestion

- **Found**
  - Already correct:
    - RLS on `events` and `excluded_devices`.
    - `anon` has column-limited INSERT only, with a day-range policy and no reads, updates or deletes.
    - Views and old views are revoked.
    - Only the publishable key is in the client.
    - No cloud-stored private records exist (tasks are local).
  - Confirmed: `data` accepted any JSON up to 2 KB, so task text could be stored by anyone with the public key.
- **Changed**
  - `events_payload_ok` (`NOT VALID`, so existing rows aren't touched).
  - New kinds have exact key and value lists. Older kinds accept only booleans, small integers, null, short lowercase
    slugs and lists of slugs, which matches what beta-2 sends; its door keys and habits were checked.
  - Helpers live in a schema PostgREST doesn't serve. `anon` needs `EXECUTE` for the check (tested), and nothing in
    `public` is executable by `anon`.
  - The migration is additive and idempotent, with a tested rollback.
- **Verified**
  - `tests/db/security_test.sql` (35 checks, two databases, with Supabase-style default grants): allowed writes,
    refused text, refused unknown kinds, refused oversize rows, the day policy, no `created_at`, and no reads,
    updates or deletes for `anon` or `authenticated`.
  - Over HTTP via PostgREST (`ingest.test.js`): 401/403 for reads and changes, 404 for the helper function.
  - Migrations ran on a production-shaped database (main's `setup.sql`) and a fresh one.
- **Limitation**
  - Not run against the real Supabase project.
  - No rate limit: anyone with the public key can add valid-looking rows with made-up device IDs, so the numbers
    depend on good faith.
  - Older kinds still accept slug-shaped strings up to 40 characters.

## 9. Calendar reminders

- **Found**
  - Correct already: the time is tomorrow if already past, the Google link carries `ctz`, recurrence is 7 days,
    escaping is right, the alarm is `TRIGGER:PT0M`, and links contain no tasks.
  - Confirmed:
    - A new random UID on every download, so adding twice makes two events.
    - The copy said an alert "pops up". Google ignores the alarm and uses the calendar's default notification.
    - No removal guidance.
    - Setup wasn't measured at all.
- **Changed**
  - A stable per-phone UID (random, not the stats ID), with `SEQUENCE` going up per file and `METHOD:PUBLISH`.
  - DTSTAMP with seconds.
  - Copy now says what the person must do (save it, set "At time of event", check the alert) and how to stop it.
  - `reminder_setup` counts taps (google_link / calendar_file / shortcut_link), once a day each.
  - Floating local time is kept on purpose.
- **Verified** (`tests/e2e/reminders.test.js`)
  - RFC 5545 line rules, required properties, start, duration, RRULE, alarm and escaping.
  - The same UID with `SEQUENCE` 0 → 1.
  - An independent parse with python `icalendar` 6.
  - Google `dates`, `ctz`, `recur`.
  - Taps counted once each, and no claim that a reminder exists.
- **Limitation**
  - **Delivery is unverified.** Whether Apple Calendar updates or duplicates on a second import, whether iOS Safari
    opens the file, whether Google's notification fires, and whether the Shortcut steps still match iOS all need the
    real-device checks (`docs/real-device-checklist.md`).

## 10. Preview, production and PWA updates

- **Found**
  - Already correct:
    - Preview is enabled only by `window.MORNWARD_PREVIEW`, set by the preview builder, never in production.
    - The preview sends nothing.
    - Test drive, pretend dates and reset exist only there.
    - Production links and QR point to mornward.app.
    - The service worker is network-first, scoped to the site, and deletes old caches but never storage.
    - Dismissal is respected. Opening the install guide counts nothing.
  - Confirmed: the beta-4 view counted an accepted prompt as installed (see 2).
  - Risks:
    - A navigation on a weak network had no timeout.
    - `terms.html` wasn't cached.
    - The activate step would delete any cache name on the origin.
    - Android Chrome can report "installed" but wasn't asked.
- **Changed**
  - SW `mornward-v4`: a 4 s fallback to the saved page (the network reply still refreshes it), terms cached, only
    `mornward-*` caches removed.
  - `getInstalledRelatedApps` plus manifest `related_applications` hide the box when Chrome reports an install. An
    unknown answer never claims "not installed".
- **Verified** (`tests/e2e/pwa.test.js`, desktop Chromium)
  - Upgrade from the previous build's SW: v3 → v4, only the old cache removed, tasks, days and ID untouched, Today
    shown.
  - Offline open, terms and a query URL.
  - 10 s network → saved page in about 4 s.
  - Upgrade from beta-2 storage: Begin plus the new terms note, old days as marks, old task kept, nothing sent before
    agreeing, old queued row sent with an ID.
  - Install box after the first routine, ✕ remembered, no box when standalone or reported installed.
  - The preview sends nothing.
  - Chrome DevTools reports no installability or manifest errors.
- **Limitation**
  - None of this ran on a real phone. iOS home-screen apps, Android WebAPK install and `getInstalledRelatedApps` on a
    device are unverified.

## Deployment order (when you decide to)

1. In a Supabase **dev/staging** project: run `20261004…`, then `20261005…` (or `setup.sql`), then
   `tests/db/security_test.sql` and `tests/db/metrics_test.sql` (the metrics test rolls itself back).
2. Production: the same two migrations, **before** deploying the beta-5 `index.html` and `sw.js`. Beta-5 rows need
   the `event_id` column, and are rejected and dropped without it. The live beta-2 app keeps working throughout: its
   rows were tested against the new checks.
3. Rollback if needed: `supabase/rollback/20261005000000_reliability_metrics.down.sql`. It keeps every row and event
   ID and restores the 20261004 views.

Correct counting doesn't make retention better. These changes only make the numbers trustworthy enough to learn from.

## Addendum: the setup-first onboarding (Phase 1) and these fixes

The setup state was added to the same reliability rules (details: `docs/onboarding.md`).

| Check | How it's verified |
| --- | --- |
| Setup and prepared tasks survive reloads and updates | `onboarding.test.js`: reload mid-setup resumes on the same step with ticks and typing; prepared tasks survive reopening on later days. `pwa.test.js`: the service-worker upgrade keeps storage. |
| Opting out stops setup counts, not setup | `onboarding.test.js` scenario 9: the whole journey with counts off; zero requests, nothing queued, no ID |
| Prepared choices can't award achievements | Scenario 1: no `routine`, `days`, `fullDays`, `startDay` after setup. Scenario 3: progress starts on the first routine day only. `setup_test.sql`: setup-only devices are in no routine report. |
| Existing users keep their tasks and history | Scenario 8 (beta-2 storage, and pre-setup beta-5 history): Begin, never setup |
| Old storage upgrades safely | The old `fl.setup` key (beta-2) is left alone; the new state is `fl.onboard`. The legacy "existing user" check now ignores this version's own agreement, which also happens at setup. A beta-4 routine record is upgraded on every load (it used to be upgraded only at start-up). |
| New kinds only after the schema change | Migration `20261006000000_setup_onboarding.sql` (additive); `setup_test.sql` checks accepted and refused rows; ingestion end to end via `ingest.test.js` |
| Failed calendar hand-offs don't trap navigation | Scenario 11: Google Calendar blocked, setup continues |
| Reminder links carry no private setup data | Scenario: the Google link has no app, task or ID; `privacy.test.js`: the icon address carries only flags |
| Deletion copy stays accurate | "Delete everything on this phone" also removes setup (scenario test); the terms list setup answers as never sent and kept on the phone |

