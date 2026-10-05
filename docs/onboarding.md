# Setup-first onboarding (Phase 1)

Mornward is for the start of the day. A first visit prepares the morning; the routine happens when the person wakes.

```text
First visit:  Welcome (optional preview) → 1 Prepare mini tasks → 2 Make it easy to return (optional) → Ready
On a computer: Welcome → "Set up where you’ll use it." (scan, or Continue on this device) → 1 → 2 → Ready
Each morning: Begin morning → three breaths → confirm mini tasks → reset complete → Today
```

A secondary route, "Starting your day now? Begin now", goes straight to the real routine (normal consent and completion
rules) with no setup questions. Nothing is restricted to clock hours.

## Screens and copy

| Screen | Heading | Actions |
| --- | --- | --- |
| Welcome | A calmer start, before the scroll. | **Prepare my morning** · "See what your morning looks like" (folded) · Starting your day now? Begin now · the counts choice and terms note |
| Computer only | Set up where you’ll use it. | "Scan to open Mornward on your phone." · QR code · Send to my phone / Copy link · **Continue on this device** (secondary) · Back |
| Step 1 of 2 | What would you like to make room for? | The routine's task chips, custom field and checks, up to 3 · **Save my morning plan** (Retry after a failed save) · Choose in the morning · Back (to Welcome) |
| Step 2 of 2 | Make it easy to return. | Time, first date (suggested: the next morning), the first reminder in words, Google Calendar / Apple Calendar / Shortcut, "Add to home screen · optional" · **Continue** · Skip for now · Back |
| Ready | Ready for your first morning. | The prepared tasks, the reminder status, "Personalize your morning invitation" (folded) · Starting your day now? Begin your reset · **Done for now** · Edit setup (secondary) |
| Prepared | A minute before the scroll. | **Begin my morning** · Edit setup · Personalize your morning invitation, Appearance, Privacy (folded) |
| Begin (returning) | Before the scroll, a few mini tasks. / Welcome back. | **Begin** |

- **Welcome preview** (folded, under "See what your morning looks like"): 1 Pause, "Follow three guided breaths."; 2
  Choose, "Confirm a few small tasks for your morning."; 3 Go, "Leave with a simple plan."; and an "Example mini
  tasks" card (Step outside, Read one page). It's an explanation, built from the existing step list and task card.
  Opening it starts no breathing, saves nothing (the examples are text, not picks), starts no history, awards
  nothing and sends nothing. The automated check compares all of the phone's storage before and after.
- **Body copy:**
  - Welcome: "Mornward is a one-minute morning reset: three breaths, then a few small tasks you choose." and "Set it
    up now. Start when you wake."
  - Ready: "When you wake, open Mornward before your usual scroll. Take three breaths, then confirm your mini tasks."
    If tasks were skipped, "…then choose your mini tasks."
  - Prepared: "Take three breaths, then choose what comes next."
- **Reminder status on Ready**, only what's known:
  - After a calendar tap: "Your planned first morning: Tuesday, October 6 at 7:00 AM. You opened your calendar for
    a reminder; check it’s saved there."
  - Otherwise (skipped, or Continue without a calendar tap): "Open Mornward when you start your day."
  - Mornward can't see the calendar, so it never says a reminder is saved or will alert.
- **Suggested first date** on step 2: the next morning, worked out from the real date each time it's shown. That's
  tomorrow, or between midnight and 4 AM, the morning about to come. The date and time can both be changed, and the
  first reminder is written out ("First reminder: Monday, October 5 at 7:00 AM, then daily for 7 mornings"), with the
  year when it isn't this year. No screen in setup says "tomorrow".
- **Invitation line** (on Prepared and Begin), from the optional "Personalize your morning invitation":
  - Exactly one named app: "Before Instagram, take a minute for yourself."
  - Several apps, unsure, something else or none: no extra line; the heading already says "A minute before the
    scroll."
  - The choices stay on the phone and only word the invitation; the section says Mornward doesn't block, watch or
    detect other apps. The same choices are under **Morning preferences** in Today.
- **Ready never shows** a sun, circles, a count, a timeline, a percentage, a streak or a "complete" claim.
- **Prepared shows** the planned first morning, but only if one was picked with a calendar action and it's still
  ahead: "Your planned first morning: Tuesday, October 6 at 7:00 AM. Start any time you're up." It's built from the
  real date and never says "late", "missed" or "tomorrow".
- **Computer:** "Prepare my morning" first offers the phone, before any personal choice: "Set up where you’ll use
  it." / "Scan to open Mornward on your phone." / "The code opens Mornward in your phone’s browser; it doesn’t
  install anything. Adding it to your home screen is a separate step, on the phone. Nothing you choose on this
  computer moves to the phone." The QR code opens `https://mornward.app/?from=qr`, with no ID or anything personal.
  "Continue on this device" starts setup there. Phones never show the code. After setup, Prepared, Begin and Today
  keep the same card beside the app.

## State model (on the phone only)

Routing never reads the stats, so it works offline and with counts off.

| Key | Holds | Notes |
| --- | --- | --- |
| `fl.onboard` | `{ v, status: "started" \| "done", step: tasks \| remind, apps[], tasksSkipped, remindSkipped, startedOn, doneOn }` | Missing for new visitors and for people from before setup existed. A saved `step: "scroll"` (from the earlier three-step order) opens on the tasks. `apps` is the optional invitation. (`fl.setup` is the beta-2 app's key and is left alone.) |
| `fl.prepared` | `{ tasks[], on, used }` | Tasks prepared for the first morning. Separate from `fl.intent:DAY` and from every completion record. |
| `fl.prepDraft` | `{ sel[], typed, touched }` | Unsaved ticks and typing on step 1, kept through Back and reloads. |
| `fl.remPlan` | `{ at, first }` | The time and first date last handed to a calendar. Shown as a plan, never as a saved reminder. Cleared by Skip for now. |
| `fl.routine`, `fl.days`, `fl.fullDays`, `fl.startDay` | Routine state and history, as before | `fl.startDay` is set only by Begin, never by setup. |

`entryState()` in `index.html` decides the first screen:

| State | When | Shows |
| --- | --- | --- |
| `routine` | a routine started today (or just before midnight, under 3 h) is at breathing or tasks | Breathing (paused) or the task step, as left |
| `today` | today's routine reached its end | Today |
| `setup` | `onboard.status = started`, and no routine history | That step, with its answers |
| `returning` | any routine history (`everStarted`, `startDay`, `days`; beta-2 users via their old `setup`/`agreed`) | Begin ("Welcome back." after a missed day). Never setup. |
| `prepared` | `onboard.status = done`, no routine yet | "A minute before the scroll." |
| `new` | none of the above | Welcome |

- **History beats setup.** Anyone with routine history is never sent into setup. Existing users can change their
  answer under **Morning preferences** in Today.
- **The preview and setup start no history.** `fl.startDay`, `fl.days`, `fl.fullDays`, `fl.everStarted` and
  `fl.routine` are written only by Begin. Sunday setup → Monday's first routine: Monday is the first date in "Your
  progress", and there is no missed Sunday. The count is distinct local dates with a full routine.
- **Prepared tasks are used once.** On the first morning they're offered ticked after breathing, with "The tasks you
  chose in setup are ticked. Keep them, change them, or add your own." Only Save confirms them. After that run's task
  step (saved or skipped) they're marked `used`, and every later day uses the normal daily suggestions.
- **iPhone home-screen icon.** It has its own storage. Its start address carries only these:
  - the random ID (only with counts on), the terms version and the counts choice, as before;
  - `e`: had routine history;
  - `o`: setup is done, or on its last step (step 2), where the home screen is offered.

  No answers, tasks or times are carried. The address is refreshed at each setup step, after setup, after the first
  Begin and when the counts are toggled.
  - An icon added on step 2 or later opens on the prepared screen without the prepared tasks (they aren't carried),
    and sends no second `setup_started`.
  - An icon added on step 1 starts setup again in its own storage.

  Not verified on a real iPhone.
- **Stray taps.** Every screen ignores taps for 500 ms after it appears. Buttons that start a routine ("Begin your
  reset", and "Begin my morning" on the prepared screen) also ignore, for 3 s, a tap landing within 48 px of the tap
  that opened the screen. That way a slow double or triple tap on Continue can never become "Begin". Keyboard and
  switch activation, and taps elsewhere, work at once.
- **Begin now after saving setup tasks.** Someone who saves tasks on step 1, goes Back to Welcome and taps "Begin
  now" is offered those tasks, ticked, on that first morning, the same as after a finished setup. They still need
  Save to be confirmed. Setup stays "started" but never shows again, because history wins.

### Routing, as verified (`tests/e2e/onboarding.test.js`, "7 routing")

| Situation | Shows |
| --- | --- |
| Setup complete, no routine yet | "A minute before the scroll." with **Begin my morning** (the first-morning invitation) |
| A routine interrupted mid-breathing | Breathing, paused ("Paused" / Resume); nothing counted |
| A routine interrupted on the tasks | The task step again; the prepared tasks still ticked and unconfirmed |
| A routine finished today | Today ("Done for today.") |
| A later day | Begin: "Welcome back." after missed days, otherwise "Before the scroll, a few mini tasks." Never setup. |
| Existing users (beta-2 storage, or this version's history) | Begin, with their history; never sent through setup |

## Events (only with the counts on; see `supabase/METRICS.md`)

| Kind | When | `data` |
| --- | --- | --- |
| `setup_started` | "Prepare my morning" the first time (on a computer, "Continue on this device"; once per device) | `run: 0` only |
| `setup_completed` | Setup reaches its end the first time (once per device; Edit setup sends nothing) | `tasks_prepared` 0–3 |
| `reminder_setup` | A calendar or Shortcut tap (once per day per action) | `action` |
| `routine_started` … `core_routine_completed` | As before | `tasks_saved.prepared`: the prepared tasks were saved unchanged |

- **Never sent:** platform choices, task text, reminder time or date, whether a reminder was saved, and anything
  about the Welcome preview (opening it isn't an event).
- **`setup_report`** (completion within 7 days, first routine by day 1 and day 7, first full routine by day 7): its
  cohort entry, local-date windows, eligible denominators, late rows and limits are defined in
  `supabase/METRICS.md`, "Setup". It's separate from D1/D7 routine retention.
- **Separate from the routine:** setup isn't a routine, preparing tasks isn't `tasks_saved`, opening the home-screen
  guide isn't an install, and finishing setup isn't activation.
- **The beta-2 `setup_done`** kind is older, has a different meaning, and isn't reused.

## Acceptance scenarios (automated: `tests/e2e/onboarding.test.js`, 120 checks; plus 38 regression checks in `onboarding-regressions.test.js`)

Every result below is from Chromium with phone emulation, not a physical phone.

| # | Scenario | Result |
| --- | --- | --- |
| P | Welcome preview: folded by default; Pause/Choose/Go and the example tasks; opening it leaves the phone's storage byte-for-byte unchanged, starts no breathing and sends nothing; the examples aren't saved or pre-ticked | Pass |
| 1 | Sunday-evening setup without the exercise: no routine, days, full days or start day; only setup events | Pass |
| 2 | Monday: prepared tasks ticked after breathing, not saved until Save, still unsaved after a reload | Pass |
| 3 | Monday full: one highlighted day (Mon 5, not Sunday), "1 morning reset completed"; partial first morning keeps its date as a small mark | Pass |
| 4 | Begin now: straight to breathing, the normal task step, never sent into setup later | Pass |
| 5 | Skip tasks and reminder (and leave the invitation alone): setup still finishes; "Open Mornward when you start your day." | Pass |
| 6 | Reopening before the planned morning: same prepared screen, the planned date, no late/missed text | Pass |
| 7 | Routing: set up, not started → interrupted (breathing, then tasks) → finished today → a later day; plus reopening after the first routine | Pass |
| 8 | Existing users (beta-2 storage; this version's history): Begin, history and tasks kept | Pass |
| 9 | Counts off: the whole journey works; nothing sent or queued; no ID made | Pass |
| 10 | Failed saves (prepared tasks; finishing setup): message, Retry, input kept, no "Ready" | Pass |
| 11 | Calendar opened but not saved: "Calendar opened—finish saving your reminder there."; prepared tasks and the date survive a reload after the hand-off; a blocked calendar doesn't trap setup; no reminder-success claim | Pass |
| 12 | Computer: the phone step comes before any choice (no setup state or event yet); "opens … doesn’t install anything"; nothing moves; the QR decodes to `https://mornward.app/?from=qr`; Continue on this device works. Pixel 7 and iPhone 13 never show the code | Pass |
| 13 | 320 px, dark mode, reduced motion and 200% text fit Welcome (preview open), both steps, Ready and Prepared; keyboard Tab/Enter/Space, including the preview and the invitation; focus to the heading; labelled toggle groups; 44 px targets | Pass (emulated) |
| — | Suggested first date: 6 AM → tomorrow; 1:30 AM → that morning; December 31 → January 1, 2027 with the year | Pass |

Also covered:

- `tests/db/setup_test.sql`: setup rows accepted, answers refused, and exact `setup_report` counts with windows.
- `tests/e2e/privacy.test.js`: icon carry contents.
- The other suites updated for the new first screen.

## Real-device checks still pending

See `docs/real-device-checklist.md` ("Setup"):

- iPhone Safari and Android Chrome, each through Welcome → setup → next morning.
- The date picker on both phones.
- Google Calendar and Apple Calendar with a chosen first date.
- The home-screen icon added during setup, which should open on the prepared screen on iPhone.
- VoiceOver and TalkBack through setup.
- iOS Dynamic Type / Android font size at the largest setting.

## Independent QA

Two rounds, six agents in total. Each worked from the brief and could not edit the repo:

- **Round 1:** code review, adversarial journeys, accessibility and layout, privacy/analytics/database.
- **Round 2:** code review, and adversarial journeys over a full week of use.

Every confirmed finding was fixed and has a check in `tests/e2e/onboarding-regressions.test.js` (or `run-all.sh` for
the database ones). Among them:

- double and triple taps into a routine (including on 320 px phones);
- step-3 choices lost on reload or at midnight;
- silent save failures, and Retry repeating the wrong action;
- a trailing " ·" in a task;
- stale tabs;
- the iPhone icon flags and when they refresh;
- older reminder links from people with counts off;
- the year on far-off dates, and a cleared time;
- layout at 200% text (sticky buttons, the switch, the Shortcut steps, Today, the desktop card, the narrow X chip);
- re-running older SQL files with newer rows present;
- outdated consent wording in the terms and docs.

Accepted as is:

- The legacy beta-2 `setup_done` kind still accepts slug answers, as the live app sends them. Tighten it once
  beta-2 is retired.
- 280 px screens at 200% text are below the 320 px target. The step header now wraps there.
