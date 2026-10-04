# Mornward beta stats

Mornward sends small anonymous records to Supabase so you can see whether the beta works.

## Routine metrics (beta-4)

From app version `beta-4` the app is a one-minute routine: Begin → three breaths → one intention → Finish.
**Apply [`migrations/20261004000000_intention_routine.sql`](migrations/20261004000000_intention_routine.sql) before this
version goes live** (or re-run `setup.sql`, which includes it). Until then the database rejects the new kinds, and the
app drops rejected rows rather than retrying them, so those routines are lost from the stats.

### Events

| Kind | Sent when | `data` |
| --- | --- | --- |
| `routine_started` | Begin is tapped | `first: true` and `from` (link source; `qr` = scanned from the computer card) on a device's first routine ever; `via: "calendar"` when opened from the calendar reminder, `via: "alarm"` from the iPhone alarm Shortcut |
| `breathing_completed` | The third full breath (in + out) ends | — |
| `breathing_skipped` | Skip breathing is tapped | `breaths_done` (0–2) |
| `intention_saved` | Mini tasks are saved and read back from the phone's storage (the first save of a routine) | `count` (1–3), `kept_defaults` (the two pre-ticked tasks saved unchanged), `own` (wrote or reused their own) — never the text |
| `intention_skipped` | Skip for today is tapped and nothing was saved for that day | — |
| `routine_finished` | The Finish screen is reached, whatever was skipped | `breathing`: completed / skipped, `intention`: saved / skipped, `seconds` |
| `core_routine_completed` | An intention is saved in a routine whose breathing was completed | — |
| `install_prompt` | Someone answers Chrome's own "Add to home screen" dialog (Android) | `outcome`: accepted / dismissed; `run: 0` |
| `app_installed` | Chrome confirms Mornward was added to the home screen (Android) | `run: 0` |

Install events aren't tied to a routine (`run: 0`, today's date) and are sent at most once per day each. iPhones give
a website no install signal, so iPhone installs show up only as later routines with `home_screen: true`.

Every row also has `run` (1 = the day's first routine, 2 = "Do the routine again", …), `home_screen`, and
`test: true` on devices opened once with `?test=1`. `day` is the phone's local date **when the routine started**,
so one started at 23:59 and finished after midnight belongs to the first date.

**Not sent:** the intention text, drafts, edits, earlier intentions, alarm time, anything typed. Editing an
intention after saving sends nothing. Taps on Finish, Edit, the calendar reminder and the privacy controls send nothing; the home-screen box sends only
the two install events in the table above.

**`reminder_opt_in` is not implemented, on purpose.** The only reminder is a calendar event handed to Google
Calendar or a calendar file; the app can't tell whether the person saved it, so it would count intent, not a
working reminder. Mornward has no push notifications and never asks for notification permission.

**Deduplication.** The phone records each `(day, run, kind)` once (stored as `fl.sent`), so redraws, reloads and
re-opening a screen send nothing new. A send that reached the server but whose reply was lost can arrive twice;
the views use `bool_or` / `count(distinct …)`, so a duplicate row never counts twice. Clearing browser data, or
the separate storage of the iPhone home-screen icon, gives a new device id (see "Storage and identity" below).

**Consent.** Nothing is sent before the first tap on Begin. New people (and anyone who agreed to an older version)
see a short note under Begin linking the terms; tapping Begin stores `agreed: beta-4`. Turning the counts off empties
the queue and stops everything.

### Definitions (views)

All views are dashboard-only (the app's key can't read them). Windows count as complete **two days after** the
local day they cover, so every time zone has finished that day before `current_date` (UTC) reaches it.

| Metric | Definition | Denominator |
| --- | --- | --- |
| First-routine completion | The device's first beta-4 routine (first day, lowest run) has `routine_finished`; the stricter version has `core_routine_completed` | All new devices |
| Next-local-day return | A `routine_started` on `first_day + 1` | New devices with `first_day + 3 <= current_date` |
| Repeat core completion within 7 days | `core_routine_completed` on any day from `first_day + 1` to `first_day + 7` | New devices with `first_day + 9 <= current_date` |
| Exact day-7 retention | A `routine_started` on exactly `first_day + 7` | Same as above |

"New devices" leaves out test devices (`test: true`, or listed in `excluded_devices`) and devices that sent events
from an earlier version (they're returning people, not new ones). Both groups are counted in their own columns.

| View | Answers |
| --- | --- |
| `routine_metrics` | One row: every metric above as a **count and a percentage**, how many devices are still inside an incomplete window, how many test / earlier-version devices were left out, and home-screen use (`used_home_screen`: opened from the icon at least once; `install_confirmed`: Chrome confirmed an install) |
| `routine_cohort` | One row per device: first day, flags for each metric, whether its windows are complete |
| `routine_runs` | One row per routine (device, day, run) with which steps happened |
| `routine_daily` | Per day: devices that started, finished breathing / skipped, saved / skipped, finished, core-completed (first run each day, tests left out) |

Leave your own phones out (your ID is under **Privacy and your data** in the app):

```sql
insert into public.excluded_devices (device_id, note) values ('YOUR-ID-HERE', 'my phone');
```

**Pre-ticked tasks.** Two of the day's ten mini tasks come ticked (the ten change each routine day, from a bank of 39), so many people will keep them. `kept_defaults` shows how often; read any "which task" interest with that in mind. (Which tasks were picked is not sent at all.)

**Reading the numbers honestly.** With tens of devices, one person moves a percentage by several points: read the
counts first. `routine_metrics` covers only the beta-4 routine. **Don't compare it with `testers` / `pass_rules`,**
which measure the old 5-step morning (see the audit below). The calendar reminder isn't measured, so these numbers
can't say whether reminders cause returns; `via: "calendar"` only shows that a routine was opened from one.

### Storage and identity

Everything lives in the browser's `localStorage` under keys starting `fl.`: `routine` (today's progress),
`intent:YYYY-MM-DD` (one intention per local date, the same key the earlier version used), `draft:YYYY-MM-DD`,
`agreed`, `deviceId`, `noStats`, `outbox`, `sent`, and `taskSeed` (a random number that orders the mini-task bank for this phone; never sent). Nothing is fingerprinted; the device id is a random UUID.

- **Android (Chrome):** an installed home-screen app shares Chrome's storage, so the intention, history and device
  id are the same in both.
- **iPhone:** a home-screen icon gets its own, empty storage. When the person opens the install steps, the icon's
  start address is set to carry the anonymous id, consent version, stats choice and link source after `#` (never
  sent to a server), so the icon isn't counted as a new person. **Intentions and history are not carried**: they
  would sit in an address. So on iPhone, the browser and the icon each keep their own history. Not tested on a
  real iPhone.
- **In-app browsers** (Reddit, Instagram) also keep separate storage; the calendar reminder link carries the id
  the same way.
- **Time zones:** a routine belongs to the local date it started on. If the date changes (midnight, or travel),
  the next open shows that date's Begin, and the earlier routine appears under "Earlier intentions" with its own
  date. A routine still in progress shortly after midnight (under 3 hours old) can be finished first.

### Audit of the earlier retention numbers (beta-3 and before)

The "about 15 setups, 0% came back" figure came from `testers` / `pass_rules` and the ad-hoc "came back" query
below. They have these problems, so treat that figure as unverified:

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

