# Mornward metric dictionary (beta-5)

What each event, cohort, date and metric means, exactly. The views implementing them are in
[`migrations/20261005000000_reliability_metrics.sql`](migrations/20261005000000_reliability_metrics.sql); the seeded
tests that pin every count are in [`../tests/db/metrics_test.sql`](../tests/db/metrics_test.sql).

Correct counting doesn't make retention better. These definitions only make the numbers trustworthy.

## Identity

| Thing | What it is | Where it lives | Notes |
| --- | --- | --- | --- |
| `device_id` | A random UUID made in the browser the first time a row is queued | `localStorage` (`fl.deviceId`) | One per browser storage, not per person. Kept across reloads and updates. Pseudonymous: it links a device's rows to each other. Forgotten by "Delete everything on this phone" or clearing site data. |
| `rid` | A random 8-hex-digit routine id, made at Begin | in `fl.routine`, sent in `data.rid` | Tells two routines apart even when run numbers collide (two storages sharing one `device_id`). Beta-4 rows have none. |
| `run` | 1 for the day's first Begin on this storage, 2 for "Do the routine again", … | `data.run` | Display/order only. Reports key routines by `rid` (or `run` for beta-4). |
| `event_id` | A random UUID per row, made when it's queued | the row; column `events.event_id` | The database skips an `event_id` it already has, so a resend is stored once. Rows from beta-4 and earlier have NULL. |

No fingerprinting and no accounts. Where identities **can't** be linked, the same person shows up as two devices:

- **iPhone home-screen icon vs Safari:** separate storage. The icon's start address carries the `device_id` (after
  `#`, on the phone only) when the install steps are opened, so the icon usually keeps the same id. Not verified on a
  real iPhone. Tasks and history are never carried, so the two keep separate task lists.
- **In-app browsers** (Reddit, Instagram, …) vs the phone's browser: separate storage, nothing carried.
- **Reminder links** (calendar, alarm Shortcut) carry no id from beta-5. If one opens in a browser with different
  storage, that's a new `device_id` whose first routine has `via` set. Those devices are left out of the acquisition
  cohort and counted under `report_exclusions` ("first counted routine opened from a reminder").
- **Cleared site data, a new phone, private windows:** a new `device_id`.
- **Counts turned off:** nothing is queued or sent, and nothing is sent later for that period. If counts are turned
  back on, the device's first counted routine isn't marked `first`, so it's left out of the acquisition cohort.

## Dates

- `day` (on every row) is the **phone's local calendar date when the routine started**, computed in one place
  (`dayKey` in `index.html`). A routine started at 23:59 and finished at 00:10 belongs to the first date. A routine
  left unfinished can still be finished up to 3 hours after it started; after that the next open is a new Begin.
- `created_at` is set by the database (UTC). The app can't set it.
- Each device's days are its own local calendar, at the time. There's no fixed cohort time zone. Rows aren't
  re-dated when someone travels: a day that's already recorded stays as it was, and a new local date is a new day.
  Travelling west can make the phone's "today" earlier than a day already recorded. That day keeps its credit and
  is never counted twice.
- **Finality rule.** A local day D is final once `current_date` (UTC) ≥ D + 3. By then D has ended in every time
  zone (UTC−12 to UTC+14), and the insert policy (`day between current_date - 2 and current_date + 2`) no longer
  accepts rows dated D, so late queued rows can't change it. A metric whose window ends on day 0 + k counts a device
  only once day 0 + k is final (day 0 + k + 3 ≤ `current_date`); until then it's in `not_yet_eligible`.
- The preview build's pretend dates (`MORNWARD_PREVIEW`) apply only in the preview build, which sends nothing.

## Events (beta-5)

Every row: `event_id`, `device_id`, `day`, `kind`, `app_version`, and `data` with `run`, `rid`, `home_screen`
(opened from a home-screen icon), `test` (only on devices opened once with `?test=1`). Never sent: task text,
drafts, edits, alarm time, anything typed. The database refuses rows whose `data` doesn't match the shapes below
(constraint `events_payload_ok`), so free text can't be added.

| Kind | Sent when (once per routine) | `data` | Does **not** mean |
| --- | --- | --- | --- |
| `routine_started` | Begin is tapped | `first: true` + `from` on the device's first routine ever; `via: calendar \| alarm` when opened from a reminder link | — |
| `breathing_completed` | The third full breath ends, with the app in view | — | Breaths can't complete while the app is hidden |
| `breathing_skipped` | Skip breathing | `breaths_done` 0–2 | — |
| `tasks_saved` | Save / Keep these is pressed in the routine's task step and the phone confirms the write | `count` 1–3, `kept_defaults` (the two pre-ticked tasks saved unchanged), `own` | That a task was done in real life. Opening the screen confirms nothing. |
| `tasks_skipped` | Skip for today in the routine's task step | `had_earlier` (tasks were already saved that day) | — |
| `routine_finished` | The Finish screen is reached, skips included | `breathing`, `tasks` (this run's task step), `core`, `def: 2`, `seconds` | A full routine |
| `core_routine_completed` | With `routine_finished`, when `breathing = completed` **and** `tasks = saved` | `def: 2` | — |
| `install_prompt` | Chrome's own install dialog is answered (Android) | `outcome: accepted \| dismissed`, `run: 0` | `accepted` is not a confirmed install |
| `app_installed` | Chrome confirms the install (Android) | `run: 0` | iPhones never send it |
| `reminder_setup` | A reminder setup tap, once per day per action | `action: google_link \| calendar_file \| shortcut_link`, `run: 0` | That a reminder was saved, is on, or will alert |

Edits after the task step (Edit, Add mini tasks) save the tasks on the phone and send nothing. They never change
`tasks`, `core`, the day's credit or the week strip.

**Definition versions.** `def: 2` (from beta-5) is the rule above. Beta-4 rows have no `def`: their
`core_routine_completed` was sent on any first save while breathing was completed, including a save from Edit after
the Finish screen. Reports count only `def = 2` as core; beta-4 core shows separately as `routine_runs.core_completed_def1`.
Beta-4 `intention_saved` / `intention_skipped` are read as `tasks_saved` / `tasks_skipped`.

## Units

| Unit | Definition | View |
| --- | --- | --- |
| Routine | One `(device_id, day, rid)`; duplicate rows count once | `routine_runs` |
| Device-day | One `(device_id, day)`, however many routines | `routine_days` |
| Active day | A device-day with `routine_started`. Opening the app without tapping Begin sends nothing, so it isn't visible. | `routine_days.started` |
| Finished day | A device-day with `routine_finished` | `routine_days.finished` |
| Full (core) day | A device-day with `core_routine_completed` (def 2) | `routine_days.core` |
| Test device | Any row with `test: true`, or listed in `excluded_devices` | `test_devices` |

## Cohorts

**Acquisition cohort** (`routine_cohort.in_acquisition_cohort`). Day 0 is the device's first routine day. It
includes only devices that:

- aren't a test device;
- sent nothing from an earlier version;
- whose first counted routine is marked `first`;
- whose first counted routine wasn't opened from a reminder.

Nothing is sent before Begin (that's when the terms are agreed), so the first eligible visit we can see is the first
routine. Visitors who never tap Begin aren't counted.

**Activation cohort.** The same devices, but day 0 is their first full (core) day (`routine_cohort.activation_day`).
Devices that never complete a full routine aren't in it.

Excluded devices and why: `report_exclusions`.

## Metrics (`retention_report`, one row each, with `numerator`, `denominator`, `pct`, `not_yet_eligible`)

| Cohort | Metric | A device counts in the numerator when… | Window ends | Eligible when |
| --- | --- | --- | --- | --- |
| acquisition | `first_day_finished` | it finished a routine on day 0 | day 0 | day 0 + 3 ≤ today |
| acquisition | `first_day_core` | full routine on day 0 | day 0 | day 0 + 3 |
| acquisition | `d1_return` | started a routine on day 1 (next local calendar day) | day 1 | day 0 + 4 |
| acquisition | `d1_core` | full routine on day 1 | day 1 | day 0 + 4 |
| acquisition | `d7_return` | started a routine on day 7 exactly | day 7 | day 0 + 10 |
| acquisition | `d7_core` | full routine on day 7 exactly | day 7 | day 0 + 10 |
| acquisition | `week1_3plus_days` | started routines on 3+ distinct days of days 0–6 | day 6 | day 0 + 9 |
| acquisition | `repeat_core_7d` | a full routine on any of days 1–7 | day 7 | day 0 + 10 |
| activation | `d1_return`, `d1_core`, `d7_return`, `week1_3plus_days`, `repeat_core_7d` | the same, counted from the first full day | as above | as above |

`week1_frequency` gives the first-week distribution (devices by number of active days, 1–7) for eligible
acquisition devices.

Return visits (`*_return`: a routine started) and repeat completions (`*_core`, `repeat_core_7d`: a full routine)
are separate rows. A return in which both steps were skipped counts as a return, not a completion.

`routine_daily`: per local day, devices that started / finished / did a full routine (each device once per day),
plus routines started. Test devices are left out.

## The beta-2 app (live until beta-5 ships): `legacy_retention_report`

Same windows and finality rule, in its own view so the two versions are never mixed:

- **Day 0:** the device's first event of any kind. Beta-2 sends nothing before setup is agreed.
- **Return:** a non-practice `morning_start`.
- **Core:** a non-practice `morning_done`.
- **Excluded:** devices in `excluded_devices`. Beta-2 has no `?test=1`.

The old views (`testers`, `pass_rules`, `daily_mornings`, `step_stats`) are kept unchanged for history.
`metrics_test.sql` confirms their known problems: `pass_rules` counts every device (test, recent and beta-4+ ones),
and `testers.first_day` is the first event of any kind. Use `legacy_retention_report` instead.

## Week strip (on the phone, not sent)

- **Window:** the last 7 local calendar days, today included. This is a rolling window, not Monday to Sunday.
- **Sun:** a full routine that day (`fullDays`, recorded from beta-5).
- **Small mark:** the routine reached the end but a step was skipped, or the day is from before beta-5 (steps
  weren't recorded on the phone then, so those days are never counted as full).
- **Ring and %:** full days in the window ÷ 7. The caption reads "N of the last 7 days · full routine: 3 breaths +
  mini tasks".

## Reminders

`reminder_setup` counts taps only.

- **Google Calendar:** opening the template link can create one new event per tap. Google doesn't take an id from
  the link, so a second tap can mean a second event. Google ignores the link's alert and uses the calendar's default
  notification, so the app asks people to set it to "At time of event".
- **Calendar file:** it has one UID per phone (random, not the stats id), with `SEQUENCE` going up per file and
  `METHOD:PUBLISH`. Whether Apple Calendar updates the existing event or adds a second one isn't verified.
- **Times:** floating local times (07:00 wherever the phone is).
- **Delivery:** whether an alert appears is unverified until the real-device checks pass
  (`docs/real-device-checklist.md`).
