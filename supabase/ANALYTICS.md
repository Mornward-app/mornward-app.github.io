# Mornward beta stats

Mornward sends small anonymous records to Supabase so you can see whether the beta works.

## Routine metrics (beta-5)

**Exact definitions of every event, cohort, date rule and metric: [`METRICS.md`](METRICS.md).** This section is the
short version.

**Order of deployment.** Apply [`migrations/20261004000000_intention_routine.sql`](migrations/20261004000000_intention_routine.sql),
then [`migrations/20261005000000_reliability_metrics.sql`](migrations/20261005000000_reliability_metrics.sql) (or
re-run `setup.sql`, which includes both), **before** the beta-5 app goes live. Beta-5 sends an `event_id` column; without
the second migration every beta-5 row is rejected and dropped. To re-run something later, re-run only the newest
migration (the older one's kind list is narrower and fails once newer rows exist; its transaction then changes
nothing). Rollback: [`rollback/20261005000000_reliability_metrics.down.sql`](rollback/20261005000000_reliability_metrics.down.sql).

**Events:** `routine_started`, `breathing_completed`, `breathing_skipped`, `tasks_saved`, `tasks_skipped`,
`routine_finished` (the end was reached, skips included), `core_routine_completed` (all three breaths **and** tasks
saved in the routine's own task step; `def: 2`), `install_prompt`, `app_installed`, `reminder_setup` (a setup tap,
not a working reminder). Edits after the task step send nothing. Beta-4's `intention_*` kinds are still accepted and
read as `tasks_*`.

**Deduplication.** Every row has a random `event_id`. The database skips an `event_id` it already has, so a send
whose reply was lost can be retried without being counted twice. The phone also records each `(day, routine, kind)`
once (`fl.sent`). Reports count routines by `(device, day, rid)` and days by `(device, day)`. Sent rows are removed
from the queue by `event_id`, so rows queued while a request is out are never dropped.

**Payload checks.** New rows' `data` must match the known shapes per kind (constraint `events_payload_ok`):
beta-4/5 kinds have an exact key list; older kinds allow only booleans, small numbers, null and short lowercase
identifiers. Free text can't be stored. Existing rows aren't re-checked.

**Consent.** Nothing is sent before the first tap on Begin. Turning the counts off (before Begin, or under Privacy)
empties the queue; nothing is queued while they're off, so turning them back on never sends that period.

**Reports** (dashboard only; the app's key can't read them): `retention_report` (every metric with numerator,
denominator and devices not yet eligible), `week1_frequency`, `report_exclusions`, `routine_daily`, and
`legacy_retention_report` for the beta-2 app, plus the building blocks `routine_cohort`, `routine_days`,
`routine_runs`, `test_devices`. The beta-4 `routine_metrics` view is replaced by `retention_report`.

Leave your own phones out (your ID is under **Privacy and your data** in the app), or open `mornward.app/?test=1`
once on each:

```sql
insert into public.excluded_devices (device_id, note) values ('YOUR-ID-HERE', 'my phone');
```

**Pre-ticked tasks.** Two of the day's ten mini tasks come ticked, so many people will keep them. `kept_defaults` shows
how often. Which tasks were picked is not sent at all.

**Reading the numbers honestly.** With tens of devices, one person moves a percentage by several points: read the
counts first. Correct counting doesn't mean retention improved.

### Storage and identity

Everything lives in the browser's `localStorage` under keys starting `fl.`: `routine` (today's progress),
`intent:YYYY-MM-DD` (mini tasks per local date, the same key earlier versions used), `draft:` / `picks:` (unsaved
typing and ticks), `days` and `fullDays` (for the week strip), `agreed`, `deviceId`, `noStats`, `outbox`, `sent`,
`taskSeed` (orders the mini-task bank; never sent), `remUid` / `remSeq` (the calendar file's event id; never sent).
Nothing is fingerprinted; the device id is a random UUID. Identity limits (iPhone icon, in-app browsers, reminder
links, cleared data) are listed in [`METRICS.md`](METRICS.md#identity).

- **Links don't carry the id (beta-5).** Calendar events, the alarm Shortcut link and copied links are plain
  `mornward.app` links. Before beta-5 they carried the id after `#`; the Google Calendar link sent it to Google
  inside the event text. Older links are still accepted when opened.
- **iPhone icon:** the one exception. Its start address carries the id, terms version and counts choice after `#`
  (on the phone only; no id at all if counts are off), so the icon isn't counted as a new person. Tasks are never
  carried. Not tested on a real iPhone.
- **Time zones:** see [`METRICS.md`](METRICS.md#dates).

### Audit of the earlier retention numbers (beta-3 and before)

The "about 15 setups, 0% came back" figure came from `testers` / `pass_rules` and the ad-hoc "came back" query
below. They have these problems, so treat that figure as unverified (items 1–3 are confirmed by seeded tests in
`tests/db/metrics_test.sql`; for the beta-2 data, use `legacy_retention_report` instead):

1. **`testers.first_day` is the first event of any kind**, including `screen_view` and `setup_done`, while
   "mornings" count only non-practice `morning_done`. A first-visit reset is a practice run, so a device's first
   real morning could only ever be on a later day.
2. **`pass_rules` divides by every tester**, including people who started less than 7 days ago, which pushes the
   week-1 percentage down for anyone recent. Only `pct_still_using_week2` uses an eligible denominator.
3. **Test traffic isn't removed.** The founder's and friends' devices (untagged `from`) are mixed in.
4. **"Came back" in the beta-2 query** means a non-practice `morning_start` on any later day, with no fixed window,
   so devices that arrived yesterday count as "not back".
5. **Small numbers.** About 13 non-team devices; 0 of 13 and 1 of 13 are both consistent with very different
   real return rates.
6. After beta-4 these views stop growing for new people: the new app sends no `morning_start` / `morning_done`.
   They're kept, unchanged, for the beta-3 history.

## What's recorded (beta-3 and earlier)

| Record | When | What's in it |
| --- | --- | --- |
| `setup_done` | Setup finished or skipped | habit type, which apps were picked, how many own apps (not their names) |
| `morning_start` | Someone taps Begin | habit type |
| `morning_done` | Done screen reached | minutes, streak, breathing done or skipped, boxes ticked, reshuffles, own steps or not, intention set (yes/no), note shown (yes/no), `practice: true` for a practice run, plus `mode: reset` for the 1-minute version |
| `rating` | 👎 / 👌 / 👍 tapped (again if they change it) | `bad`, `ok` or `good`, plus `changed_from` when it replaces an earlier rating. Only the latest rating per person per day is counted in `daily_mornings`. |
| `door_open` | A utility app is opened | which app (`own` for self-added ones) |

Every record also has a random device id, the day, whether it was opened from the home screen, and the app version.

Practice runs (the optional run right after setup) carry `practice: true` on `morning_start`, `morning_done`, `rating` and `door_open`. The views leave them out, so only real mornings count.

The 1-minute version (offered after setup in the afternoon and evening) sends one `morning_done` with `practice: true` and `mode: reset`, so it never counts as a real morning.

`morning_start` carries `via: calendar` when the morning was opened from the calendar reminder.

New visitors (from the reset-first welcome) do the 1-minute reset before any setup question. Their `setup_done` is sent once, when that first reset is finished, with `flow: "reset"` and `habit: null`; if they answer the optional question afterwards, the habit is saved on the phone and shows up on their `morning_start` events, without a second `setup_done`.

`screen_view` (from app version beta-3) records which first-visit screens a new device reached: `data.screen` is one of `view_welcome`, `view_phone_first`, `view_welcome_install_steps`, `view_terms`, `view_reset_breathe`, `view_reset_read`, `view_reset_one`, `view_homescreen_prompt`, `view_install_steps`, `view_install_prompt`, `view_personalize`, `view_see_you`. Each screen is sent at most once per visit, only for people who weren't set up yet, and nothing is sent before the terms are agreed (welcome and phone-first views wait and go with the agreement). So the welcome and terms counts only include people who agreed: compare them with ad clicks to see who left before agreeing. See the `onboarding_funnel` view. Re-run `setup.sql` once before this version goes live, or the database rejects these rows (the app sends them separately, so nothing else is lost).

`setup_done` also carries `from`: the link source (`?from=reddit` → `reddit`), or null. Count sign-ups by source:

```sql
select coalesce(data->>'from', '(none)') as source, count(distinct device_id)
from events where kind = 'setup_done' group by 1 order by 2 desc;
```

**Never recorded:** notes, intentions, custom step text, own-app names or addresses, search text, names or emails.
People can turn stats off at the bottom of the done screen. Clearing browser data gives a device a new id.

## One-time setup

1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste all of [`setup.sql`](setup.sql) and click **Run**. It's safe to run again later.

Already set up? Run only the newest file in [`migrations/`](migrations/) the same way (also safe to run again).

## Reading your data

Supabase dashboard → **Table Editor**. The views are listed with the tables:

| View | Answers |
| --- | --- |
| `pass_rules` | Your pass rules in one row: % of testers who did 4+ of their first 7 mornings, and % still using it in week 2 |
| `testers` | One row per tester: start day, mornings in weeks 1 and 2, last morning, habit |
| `daily_mornings` | Per day: people who started, finished, and how they rated it |
| `step_stats` | Averages: minutes, % skipping breathing, % reshuffling moves, % opening from the home screen |
| `events` | Every raw record |

The app can only **add** records to `events`. It can't read, change or delete anything, and it can't see the views.

## Handling a data request (PDPA)

People email their anonymous ID to the contact address (the app shows it under **Privacy and your data**; versions before beta-4 called it **Show my ID / delete my data**).
Reply within 30 days; aim for a few days.

**Delete:** Supabase → SQL Editor → run, with their ID:

```sql
delete from public.events where device_id = 'THEIR-ID-HERE';
delete from public.excluded_devices where device_id = 'THEIR-ID-HERE';
```

**See their data** (if they ask for a copy): run this, then export the result as CSV and email it:

```sql
select created_at, day, kind, data from public.events where device_id = 'THEIR-ID-HERE' order by created_at;
```

Then reply: "Done. Every record with that ID has been deleted." Keep a one-line note of the date and the request.

**Who is asking.** The ID is the only link to the records, and anyone who has it could send it. It isn't a password:
reply only to the address the request came from, and for a copy of the data, send it only there.

**Nothing is automatic.** Requests and the end-of-beta deletion are done by hand with the SQL here; there is no
scheduled job. Keep the dates in your notes so the 30-day and 90-day promises are kept.

**When the beta ends:** export anything you need, then delete all rows within 90 days (the terms promise this):

```sql
delete from public.events;
```

## Did the beta-2 fixes help?

Version `beta-2` added the time-of-day first visit, the note for tomorrow and the calendar reminder. Compare how many people came back for a real morning on a later day, by the version they set up on:

```sql
with s as (
  select device_id, min(app_version) as version, min(day) as setup_day
  from events where kind = 'setup_done' group by device_id
)
select s.version,
       count(*) as setups,
       count(*) filter (where exists (
         select 1 from events m
         where m.device_id = s.device_id and m.kind = 'morning_start'
           and coalesce(m.data->>'practice', '') <> 'true' and m.day > s.setup_day
       )) as came_back
from s group by s.version order by s.version;
```

Mornings opened from the calendar reminder:

```sql
select day, count(distinct device_id) as people
from events where kind = 'morning_start' and data->>'via' = 'calendar'
group by day order by day;
```

