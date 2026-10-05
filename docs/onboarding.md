# Setup-first onboarding (Phase 1)

Mornward is for the start of the day. A first visit prepares the morning; the routine happens when the person wakes.

```text
First visit:  Welcome → 1 Where the scroll starts → 2 Prepared mini tasks → 3 Reminder (+ home screen) → Setup complete
Each morning: Begin morning → three breaths → confirm mini tasks → reset complete → Today
```

A secondary route, "Already starting your day? Begin now", goes straight to the routine with no preference
questions. Nothing is restricted to clock hours.

## Screens and copy

| Screen | Heading | Actions |
| --- | --- | --- |
| Welcome | A calmer start, before the scroll. | **Set up my morning** · Already starting your day? Begin now · the counts choice and terms note |
| Step 1 of 3 | Where does your morning scroll usually start? | Choices: Instagram, TikTok, YouTube, Facebook, Reddit, X, Something else, I'm not sure (exclusive) · **Continue** · Skip · Back |
| Step 2 of 3 | What would you like to make room for? | The routine's task chips, custom field and checks, up to 3 · **Save my tasks** (Retry after a failed save) · Choose in the morning · Back |
| Step 3 of 3 | Make room for your first morning. | Time, first date (defaults to the next occurrence), the first reminder in words, Google Calendar / Apple Calendar / Shortcut, "Add to home screen · optional" · **Continue** · Skip reminder · Back |
| Setup complete | You're ready for your first morning. | Starting your day now? Begin your reset (under the text, away from where Continue was) · **Done for now** · Edit setup |
| Prepared | A minute before the scroll. | **Begin my morning** · Edit setup · Appearance, Privacy |
| Begin (returning) | Before the scroll, a few mini tasks. / Welcome back. | **Begin** |

- **Body copy:**
  - Welcome: "Mornward is a one-minute morning reset: three breaths, then a few small tasks you choose." and "Set it
    up now. Start when you wake."
  - Setup complete: "When you wake, open Mornward before your usual scroll. Your mini tasks will be waiting." If
    tasks were skipped, the last sentence is "You can choose your mini tasks then."
  - Prepared: "Take three breaths, then choose what comes next."
- **Invitation line** (on Prepared and Begin):
  - Exactly one named app: "Before Instagram, take a minute for yourself."
  - Several apps, unsure, something else or skipped: no extra line; the heading already says "A minute before the
    scroll."
- **Setup complete never shows** a sun, a count, a timeline, a percentage, a streak, a "complete" claim or any
  reminder status.
- **Prepared shows** the planned first morning, but only if one was picked with a calendar action and it's still
  ahead: "Your planned first morning: Tuesday, October 6 at 7:00 AM. Start any time you're up." It's built from the
  real date and never says "late", "missed" or "tomorrow".
- **Desktop:** "Keep it where your morning starts." / "Scan this code to set up Mornward on your phone." / "It opens
  fresh there: anything you choose on this computer stays on this computer." The QR code opens
  `https://mornward.app/?from=qr`, with nothing personal in it.

## State model (on the phone only)

Routing never reads the stats, so it works offline and with counts off.

| Key | Holds | Notes |
| --- | --- | --- |
| `fl.onboard` | `{ v, status: "started" \| "done", step: scroll \| tasks \| remind, apps[], tasksSkipped, remindSkipped, startedOn, doneOn }` | Missing for new visitors and for people from before setup existed. (`fl.setup` is the beta-2 app's key and is left alone.) |
| `fl.prepared` | `{ tasks[], on, used }` | Tasks prepared for the first morning. Separate from `fl.intent:DAY` and from every completion record. |
| `fl.prepDraft` | `{ sel[], typed, touched }` | Unsaved ticks and typing on step 2, kept through Back and reloads. |
| `fl.remPlan` | `{ at, first }` | The time and first date last handed to a calendar. Shown as a plan, never as a saved reminder. |
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
- **Prepared tasks are used once.** On the first morning they're offered ticked after breathing, with "The tasks you
  chose in setup are ticked. Keep them, change them, or add your own." Only Save confirms them. After that run's task
  step (saved or skipped) they're marked `used`, and every later day uses the normal daily suggestions.
- **iPhone home-screen icon.** It has its own storage. Its start address carries only these:
  - the random ID (only with counts on), the terms version and the counts choice, as before;
  - `e`: had routine history;
  - `o`: setup is done, or on its last step, where the home screen is offered.

  No answers, tasks or times are carried. The address is refreshed at each setup step, after setup, after the first
  Begin and when the counts are toggled.
  - An icon added on step 3 or later opens on the prepared screen without the prepared tasks ("You can choose your
    mini tasks then"), and sends no second `setup_started`.
  - An icon added on step 1 or 2 starts setup again in its own storage.

  Not verified on a real iPhone.
- **Stray taps.** Every screen ignores taps for 500 ms after it appears. Buttons that start a routine ("Begin your
  reset", and "Begin my morning" on the prepared screen) also ignore, for 3 s, a tap landing within 48 px of the tap
  that opened the screen. That way a slow double or triple tap on Continue can never become "Begin". Keyboard and
  switch activation, and taps elsewhere, work at once.
- **Begin now after saving setup tasks.** Someone who saves tasks on step 2, goes Back to Welcome and taps "Begin
  now" is offered those tasks, ticked, on that first morning, the same as after a finished setup. Setup stays
  "started" but never shows again, because history wins.

## Events (only with the counts on; see `supabase/METRICS.md`)

| Kind | When | `data` |
| --- | --- | --- |
| `setup_started` | "Set up my morning" the first time (once per device) | `run: 0` only |
| `setup_completed` | Setup reaches its end the first time (once per device; Edit setup sends nothing) | `tasks_prepared` 0–3 |
| `reminder_setup` | A calendar or Shortcut tap (once per day per action) | `action` |
| `routine_started` … `core_routine_completed` | As before | `tasks_saved.prepared`: the prepared tasks were saved unchanged |

- **Never sent:** platform choices, task text, reminder time or date, and whether a reminder was saved.
- **Separate from the routine:** setup isn't a routine, preparing tasks isn't `tasks_saved`, opening the home-screen
  guide isn't an install, and finishing setup isn't activation.
- **The beta-2 `setup_done`** kind is older, has a different meaning, and isn't reused.

## Acceptance scenarios (automated: `tests/e2e/onboarding.test.js`, 81 checks; plus 38 regression checks in `onboarding-regressions.test.js`)

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Sunday-evening setup without the exercise: no routine, days, full days or start day; only setup events | Pass |
| 2 | Monday: prepared tasks ticked after breathing, not saved until Save, still unsaved after a reload | Pass |
| 3 | Monday full: one highlighted day (Mon 5, not Sunday), "1 morning reset completed"; partial first morning keeps its date as a small mark | Pass |
| 4 | Begin now: straight to breathing, the normal task step, never sent into setup later | Pass |
| 5 | Skip platforms, tasks and reminder: setup still finishes ("You can choose your mini tasks then") | Pass |
| 6 | Reopening before the planned morning: same prepared screen, the planned date, no late/missed text | Pass |
| 7 | Reopening after the first finished routine: Today | Pass |
| 8 | Existing users (beta-2 storage; this version's history): Begin, history and tasks kept | Pass |
| 9 | Counts off: the whole journey works; nothing sent or queued; no ID made | Pass |
| 10 | Failed saves (prepared tasks; finishing setup): message, Retry, input kept, no "You're ready" | Pass |
| 11 | Calendar opened but not saved: "Calendar opened—finish saving your reminder there."; a blocked calendar doesn't trap setup; no reminder-success claim | Pass |
| 12 | Desktop: honest hand-off copy; the QR code decodes to `https://mornward.app/?from=qr` | Pass |
| 13 | 320 px, dark mode and 200% text fit every setup screen; keyboard Tab/Enter/Space; focus to the heading; labelled toggle group; 44 px targets | Pass (emulated) |

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
