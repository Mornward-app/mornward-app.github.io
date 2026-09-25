# Mornward beta stats

Mornward sends small anonymous records to Supabase so you can see whether the beta works.

## What's recorded

| Record | When | What's in it |
| --- | --- | --- |
| `setup_done` | Setup finished or skipped | habit type, which apps were picked, how many own apps (not their names) |
| `morning_start` | Someone taps Begin | habit type |
| `morning_done` | Done screen reached | minutes, streak, breathing done or skipped, boxes ticked, reshuffles, own steps or not, intention set (yes/no), note shown (yes/no) |
| `rating` | 👎 / 👌 / 👍 tapped (again if they change it) | `bad`, `ok` or `good`, plus `changed_from` when it replaces an earlier rating. Only the latest rating per person per day is counted in `daily_mornings`. |
| `door_open` | A utility app is opened | which app (`own` for self-added ones) |

Every record also has a random device id, the day, whether it was opened from the home screen, and the app version.

**Never recorded:** notes, intentions, custom step text, own-app names or addresses, search text, names or emails.
People can turn stats off at the bottom of the done screen. Clearing browser data gives a device a new id.

## One-time setup

1. Supabase dashboard → **SQL Editor** → **New query**.
2. Paste all of [`setup.sql`](setup.sql) and click **Run**. It's safe to run again later.

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

People email their anonymous ID to the contact address (the app shows it under **Show my ID / delete my data**).
Reply within 30 days; aim for a few days.

**Delete:** Supabase → SQL Editor → run, with their ID:

```sql
delete from public.events where device_id = 'THEIR-ID-HERE';
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
