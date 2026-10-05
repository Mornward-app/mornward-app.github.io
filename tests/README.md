# Tests

Automated checks for the app (in a real browser engine) and the database (on a local dev Postgres shaped like
Supabase). Nothing here touches production.

| File | What it checks |
| --- | --- |
| `db/security_test.sql` | As the app's key (`anon`) and `authenticated`: valid rows go in; re-sent `event_id`s are skipped; free text and unknown kinds are refused; nothing can be read, changed or deleted; RLS is on |
| `db/metrics_test.sql` | Seeded people (returners, non-returners, recent joiners, duplicate sessions, test devices, beta-4 and beta-2 rows) and the exact count every report must give |
| `e2e/routine.test.js` | Finished vs full routine, interruption and reload at every stage, task validation and save failures |
| `e2e/dates.test.js` | Midnight, year end, daylight saving (both ways), travel, preview dates ignored in production |
| `e2e/privacy.test.js` | The counts choice from the first screen, queued rows after opting out, no backfill, no task text in requests, no ID in links |
| `e2e/reminders.test.js` | Calendar file (RFC 5545 lines, stable UID, alarm, escaping; optional independent parse) and Google link; setup taps counted as taps |
| `e2e/pwa.test.js` | Service-worker upgrade from the previous build, offline, slow network, install prompts, preview vs production, upgrading from beta-2 storage |
| `e2e/ingest.test.js` | The app through a local PostgREST into the dev database: lost replies, retries, reloads, old queued rows, the key over HTTP |

## Setup (once)

- Node 18+ with Playwright (`npm i -g playwright`, or set `NODE_PATH` to where it's installed) and its Chromium.
- Postgres 15 or 16 with `psql`, and a superuser for the tests:
  `create role mwtest login superuser password 'dev-only';`
- [PostgREST](https://github.com/PostgREST/postgrest/releases) 12 (Supabase runs 12.x). Put it on `PATH` or set
  `POSTGREST_BIN`. `tests/db/supabase_roles.sql` creates its login role (`authenticator`, password `dev-only`).
- Optional: `pip install icalendar` (or set `ICAL_PYTHONPATH`) for the independent calendar-file parse.

Environment (defaults shown): `DEV_DB_ADMIN_URL=postgres://mwtest:dev-only@localhost:5432/postgres`,
`DEV_DB_AUTH_URL=postgres://authenticator:dev-only@localhost:5432/`.

## Run

```sh
tests/run-all.sh              # everything; exit code 0 only if all pass
node tests/e2e/routine.test.js  # one browser suite (no database needed, except ingest)
```

These run in desktop Chromium with phone emulation. They don't replace a real iPhone and Android phone:
see `docs/real-device-checklist.md`.
