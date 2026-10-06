# Setup-first onboarding (Phase 1)

Mornward is for the start of the day. A first visit prepares the morning; the routine happens when the person wakes.

```text
First visit:  Welcome → 1 Pick tasks → 2 Make it easy to return (optional) → Ready (the same screen as Prepared)
On a computer: the same; the phone code sits beside Welcome, the ready / next-morning screen, Begin and Today
               (not beside the two setup steps, which stay focused)
Each morning: Begin my morning → three breaths → confirm tasks → complete → Today
```

"Up already? Begin now" goes straight to the real routine (normal consent and completion rules).

## Few words, more pictures

Every screen keeps to a word budget, checked by `tests/e2e/onboarding.test.js`. The counts are the app's own visible
words: task names (shuffled per phone), folded sections and screen-reader-only text are left out.

| Screen | Budget | Now | What carries it instead of words |
| --- | --- | --- | --- |
| Welcome | 45 | ~43 | The sun; the promise; three icons (3 breaths · Mini tasks · Ready) |
| 1 Pick tasks | 25 | ~22 | Six task chips (was ten); step bars instead of "Step 1 of 2" |
| 2 Make it easy to return | 35 | ~32 | Time and date pickers; one calendar button for this phone. The other phone, the instructions, the file and the Shortcut are under **More options** |
| Ready (right after setup) | 35 | ~28 | The plan card; a calendar icon with the date |
| Prepared (next morning) | 40 | ~37 | The sun, the promise, the three icons, the plan card |
| Morning tasks | 25 | ~20 | Six chips; one short hint |

- **The promise** (Welcome and Prepared, under the heading): "Start your day on purpose, not on a feed."
- **What it is, in ten words** (computer only, a box above the phone code, from Welcome on): "What is Mornward?" / "A one-minute
  morning routine: three breaths, then your chosen tasks."
- **The phone code beside the app** (computers, from Welcome on) is a slim column, 236 px, with the code centred in its card, so someone on a computer can open Mornward on their phone and add it to the home screen there.

## Screens and copy

| Screen | Heading | Everything else |
| --- | --- | --- |
| Welcome | A calmer start, before the scroll. | The promise · icons: 3 breaths · Mini tasks · Ready · **Prepare my morning** · Up already? Begin now · "Free · No account · Continuing accepts the beta terms." · "Anonymous counts on. Turn off" · What's counted (folded) |
| 1 Pick tasks | Pick your morning tasks. | "Up to 3." · six chips · Add your own · **Save my plan** · Choose later · Back · step bars |
| 2 Make it easy to return | Make it easy to return. | Time · First morning (suggested: the next morning) · "First reminder: Monday, October 5 at 7:00 AM" · **Add to Google Calendar** or **Add to Apple Calendar** · More options (folded) · Add to home screen · optional (folded) · **Continue** · Skip for now |
| Ready / Prepared | "Ready for your first morning." right after setup; "A minute before the scroll." when opened again | Right after setup: "When you wake, open Mornward first." · Your plan · the reminder line. Later: the promise · icons · Your plan. Both: **Begin my morning** · Edit setup · Personalize, Privacy (folded). There is no separate "Done for now" step. |
| Morning tasks | What matters this morning? | "Your plan is ticked." (first morning) / "Two picked. Up to 3." / "Today's tasks are ticked." · six chips · **Save my tasks** · Skip for today |

- **Reminder line on Ready**, only what's known: after a calendar tap, a calendar icon and "Tuesday, October 6 at
  7:00 AM. Check your calendar saved it." With no calendar tap, no line at all. Mornward can't see the calendar, so
  it never says a reminder is saved or will alert.
- **More options** (step 2 and Today's Morning reminder): the iPhone / Android switch, what to do in the calendar
  ("At time of event"), "Use a calendar file instead", the iPhone alarm Shortcut, and "Repeats every morning until
  you delete it in your calendar. Mornward never asks for notification permission."
- **The reminder card:** the time with quick picks (6:00 to 8:00), and the first reminder in words. No day to pick:
  the event repeats every morning, so the first one is simply the next time it comes round.
- **Apple Calendar:** a real link to a file on the site, `cal/HHMM.ics` (one per minute of the day, made by
  `tools/make-calendar-files.py`). iPhone Safari shows Apple Calendar's own add sheet; nothing is downloaded to Files.
  The same time is the same file for everyone, so it carries no ID.
- **The button:** "Continue" (with Skip for now) until a calendar is opened, then "Done" with no Skip, there and on
  the "All set to return" card.
- **See you tomorrow:** after the first setup, Ready's main button is "See you tomorrow" (set up between midnight
  and 4 AM: "See you in the morning"). Tapping it says "All set. You can close Mornward now." and starts nothing;
  "Or try it now" starts the routine. Opened again the same evening, it's still this screen. From 4 AM, or the first
  reminder if that's sooner (set up at 5 AM with a 6:30 reminder: "See you at 6:30 AM", then the morning screen at
  6:30), the morning screen with "Begin my morning" shows, also in a tab left open overnight. Opened from the
  reminder or alarm link, it's always the morning screen. Based on `doneAt` in `fl.onboard` (the first setup only,
  so a later edit never moves it).
- **Alarm Shortcut (iPhone):** right under Add to Apple Calendar, "Open Mornward when my alarm stops" opens the four
  Shortcuts steps, Copy link and Open Shortcuts (one row) in place, scrolling just enough to clear the sticky buttons. Copying the link counts as a way back (`fl.shortcutCopied`): the
  button says Done. Its link carries the setup after `#` (see "Carried setups" in supabase/METRICS.md).
- **Leave this page open:** said once, when See you tomorrow is tapped, in Safari or Chrome itself: "All set. Lock
  your phone with this page open. It'll be here when you unlock." (No line before the tap: Ready stays within 40
  words.) Inside another app's browser it points to the Copy link for Safari card instead; on a computer or the
  home-screen app, "You can close Mornward now."
- **Opened from Reddit? (Copy link for Safari/Chrome):** on Ready when it's probably another app's built-in browser
  (a recognised one, or on iPhone a link from a social app). The link carries the setup into the phone's own browser.
- **After ticking:** the line under the tasks (Finish and Today, announced to screen readers) says "Go do your first
  task, then come back and tick it.", then "1 of 2 done. Go do the next one.", then, with a check, "All done. Lock your
  phone and enjoy your morning." Today's circle in Your progress gets a check once every task is ticked; the phone
  gives a short buzz on each tick (where it can). All ticked on Finish ends the morning there: no Done button.
- **Ticking tasks off:** on Finish and Today each mini task is a row to tick once it's done ("Go do your first task,
  then come back and tick it."). Kept per day on the phone (`fl.doneTasks:DAY`, by name); `tasks_ticked` counts how
  many, never which.
- **Morning card:** 14 short, sourced facts (`MORNING_CARDS` in index.html), one per completed morning in order,
  starting again after the 14th. The question shows the night before on Ready ("Tomorrow's card") and in the morning
  before Begin ("Today's card", "Unlocks when you finish your morning tasks"). After the routine it stays locked on
  Finish and Today ("Unlocks when you tick off your mini tasks", "Tick off your remaining task to unlock", or with no
  tasks "Add and tick a mini task to unlock today's card") until every task is ticked; then, in place, the two-sentence
  answer, "That's all for today.", the source, and tomorrow's question. Unticking locks it again. A second routine the same day keeps the card;
  a missed day doesn't skip one. Nothing about the cards is sent. Card text is content, so it's left out of the word
  budgets (like the task names).
- **No second step 2:** once a reminder was added, step 2 isn't shown again (back from the calendar, a reload, or
  Edit setup): it goes straight to Ready. The one exception is "All set to return" (reminder and home screen both
  done). The reminder can still be changed from Today's Morning reminder.
- **Already on my home screen:** in the home-screen row. Safari can't see the home screen, so someone who added
  it from the Share menu taps this once; the row becomes a tick and no add offer shows again on that phone.
- **Added once, never asked again:** the calendar event repeats every morning until deleted (the alert is at the
  event's time, so the phone notifies each morning). After a calendar tap, step 2 (Edit setup) and Today's Morning
  reminder show "Your calendar reminder · 7:00 AM, every morning" with "Change it or add it again" instead of the
  controls; there's no Skip, nothing to skip. Changing the time says to delete the old event first. It's what was
  added from this phone; Mornward can't see the calendar.
- **First reminder:** the next time the chosen time comes round, worked out from the real date and time each time
  it's shown (6 AM with 7:00 → later this morning; 8 AM → tomorrow). No setup screen says "tomorrow".
- **Personalize** (folded on Ready and Prepared; "Morning preferences" in Today): "Where does your scroll start?
  Stays on this phone. Mornward doesn't block or watch apps." Exactly one named app gives the invitation "Before
  Instagram, take a minute for yourself."; anything else, none.
- **The ready screen never shows** a sun, circles, a count, a timeline, a percentage, a streak or a "complete" claim. A stray tap from the last setup step can't hit Begin or Edit setup (they wait for a settled tap).
- **Computer:** the phone code is beside Welcome, before any choice, and beside the ready screen, Begin and Today (not the two setup steps). There is no separate phone step. The QR code opens `https://mornward.app/?from=qr`, with no
  ID or anything personal. Phones never show it. After setup, Prepared, Begin and Today keep the same card beside
  the app.

## Arriving from the computer's QR code

On a phone, a visit from the computer's QR code (`?from=qr`) opens the home-screen steps by themselves over
Welcome, about a second after it appears: "One tap from your home screen when you wake." The steps are for this
phone (iPhone or Android, from the browser; switchable). On Android, when Chrome offers its own dialog, a one-tap
**Add to home screen** button sits on top. **Later** closes it. It opens once per phone (`fl.qrGuide`), never in the
installed app, never on a computer, and never over an existing user's Begin. It agrees to nothing and sends nothing.
Checked by `tests/e2e/qr-guide.test.js`.

## Once it's on the home screen

`fl.homeAdded` (`{ how, on }`, on the phone only) means Mornward is on this phone's home screen. After that, every
add offer stays away for good: the box on Begin and Today, the quiet row, setup's "Add to home screen · optional",
and the QR arrival steps. It's set when Mornward is opened from the icon (`opened`; on Android the icon shares this
storage with Chrome), when Chrome reports the install (`installed`) or lists it as installed (`detected`), or when
someone taps **I've added it** in the steps (`self`; on iPhone Safari can't see the icon). New visitors and
browsers without it see the offer as before. It's never sent; only Chrome's own install is counted (`app_installed`).

**Step 2 when it's already done.** If the reminder was added and Mornward is on the home screen, step 2 shows one
card: "✓ All set to return", "✓ Calendar reminder: 6:30 AM, every morning", "✓ On your home screen", a "Change the
reminder" link, and **Continue** (no Skip). If only the home screen is done, the add row becomes "✓ On your home
screen" and the reminder card shows as usual. If only the reminder is done, the saved reminder shows and the add
row is still offered.

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
- **Begin now after saving setup tasks.** Someone who saves tasks on step 1, goes Back to Welcome and taps "Up
  already? Begin now" is offered those tasks, ticked, on that first morning, the same as after a finished setup. They still need
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
| `setup_started` | "Prepare my morning" the first time (once per device) | `run: 0` only |
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

## Acceptance scenarios (automated: `tests/e2e/onboarding.test.js`, 118 checks; plus 38 regression checks in `onboarding-regressions.test.js`)

Every result below is from Chromium with phone emulation, not a physical phone.

| # | Scenario | Result |
| --- | --- | --- |
| W | Word budgets: Welcome, both steps, Ready, Prepared and the morning task step each stay under their budget; six task chips at most; the promise on Welcome and Prepared | Pass |
| P | Viewing Welcome changes nothing stored on the phone, starts nothing and sends nothing | Pass |
| 1 | Sunday-evening setup without the exercise: no routine, days, full days or start day; only setup events | Pass |
| 2 | Monday: prepared tasks ticked after breathing ("Your plan is ticked."), not saved until Save, still unsaved after a reload | Pass |
| 3 | Monday full: one highlighted day (Mon 5, not Sunday), "1 morning reset completed"; partial first morning keeps its date as a small mark | Pass |
| 4 | Begin now: straight to breathing, the normal task step, never sent into setup later | Pass |
| 5 | Skip tasks and reminder: setup still finishes; no reminder line | Pass |
| 6 | Reopening before the first morning: the same prepared screen, no "tomorrow", late or missed | Pass |
| 7 | Routing: set up, not started → interrupted (breathing, then tasks) → finished today → a later day; plus reopening after the first routine | Pass |
| 8 | Existing users (beta-2 storage; this version's history): Begin, history and tasks kept | Pass |
| 9 | Counts off: the whole journey works; nothing sent or queued; no ID made | Pass |
| 10 | Failed saves (prepared tasks; finishing setup): message, Retry, input kept, no "Ready" | Pass |
| 11 | Calendar opened but not saved: "Calendar opened—finish saving your reminder there."; tasks and the reminder survive a reload after the hand-off; a blocked calendar doesn't trap setup; no reminder-success claim | Pass |
| 12 | Computer: the code beside Welcome before any choice (no setup state or event yet); "Installs nothing"; "Choices made here stay here"; the QR decodes to `https://mornward.app/?from=qr`; Prepare my morning goes straight to step 1. Beside the app: a slim card (≤ 240 px), the code centred, and "What is Mornward?" in ten words above it. Phones never show the code | Pass |
| 13 | 320 px, dark mode, reduced motion and 200% text: every setup and morning screen fits the phone's width (checked against the screen, not the stretched viewport); keyboard; focus to the heading; labelled toggle groups; 44 px targets | Pass (emulated) |
| — | First reminder: 6 AM (7:00) → that morning; 8 AM → tomorrow; 1:30 AM → that morning; December 31 → January 1, 2027 with the year | Pass |

Also covered:

- `tests/db/setup_test.sql`: setup rows accepted, answers refused, and exact `setup_report` counts with windows.
- `tests/e2e/privacy.test.js`: icon carry contents.
- The other suites updated for the new first screen.

## Real-device checks still pending

See `docs/real-device-checklist.md` ("Setup"):

- iPhone Safari and Android Chrome, each through Welcome → setup → next morning.
- Google Calendar, and Apple Calendar's add sheet from the linked file (no download).
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
