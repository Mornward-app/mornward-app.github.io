// Issues 3 and 8 end to end: the real app, through a local PostgREST (what Supabase runs), into a dev database with
// both migrations. Retries, reloads and old queued rows must not inflate counts; the app's key must not read or
// change anything; bad rows must not take good ones down with them.
// Needs Postgres + PostgREST (tests/README.md). Run: node tests/e2e/ingest.test.js
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter, freshDb, query, postgrest } = require("./helpers");
const { ok, done } = reporter("ingest: PostgREST + dev database");
async function drain(x) { for (let i = 0; i < 60 && ((await x.ls("outbox")) || []).length; i++) { await x.t(100); await x.p.waitForTimeout(80); } }

(async () => {
  const db = freshDb("mw_e2e");
  const api = await postgrest("mw_e2e");
  const site = await serve();
  const b = await chromium.launch();
  const now = new Date().toISOString(); // the insert policy accepts today ± 2 days, so the page clock starts now
  const open = (opt = {}) => ctx(b, site.url, { when: now, rest: api.base, ...opt });
  const forDevice = (id, sql) => query(db, sql.replace(/\$ID/g, `'${id}'`));

  // A full routine, a reply lost on the first send, reloads at every stage
  { const x = await open({ status: (n) => (n === 0 ? "lost" : 201) }); await x.goto();
    await S.begin(x); await x.p.reload(); await x.t(700);
    await x.p.click("#bpause"); await x.t(31000); await x.p.reload(); await x.t(700);
    await S.keep(x); await x.p.reload(); await x.t(700); // reopens on Today (the completion screen isn't replayed)
    await x.p.reload(); await x.t(700); await drain(x);
    const id = await x.ls("deviceId");
    const got = forDevice(id, "select string_agg(kind, ',' order by kind) from events where device_id = $ID");
    ok("a lost reply, a retry and four reloads: each step stored exactly once", got === "breathing_completed,core_routine_completed,routine_finished,routine_started,tasks_saved", got);
    ok("every stored row has its own event_id", forDevice(id, "select count(*) = count(distinct event_id) and count(*) filter (where event_id is null) = 0 from events where device_id = $ID") === "t");
    ok("the first send really was stored before the app retried it (the retry was skipped by the database)",
      x.bodies.length >= 2 && JSON.parse(x.bodies[0]).length >= 1 && forDevice(id, `select count(*) from events where event_id = '${JSON.parse(x.bodies[0])[0].event_id}'`) === "1");
    // Ticking tasks off: the app's real rows are accepted; untick and tick again sends nothing new; the report reads the high
    const n = (await x.p.$$("[data-task]")).length;
    await x.p.click('[data-task="0"]'); await x.t(200); await x.p.click('[data-task="0"]'); await x.t(200); await x.p.click('[data-task="0"]'); await x.t(200);
    await x.p.click('[data-task="1"]'); await x.t(200); await drain(x);
    const ticks = forDevice(id, "select string_agg((data->>'ticked') || '/' || (data->>'total'), ',' order by data->>'ticked') from events where device_id = $ID and kind = 'tasks_ticked'");
    ok("ticks: the app's tasks_ticked rows are stored, one per new high (1, then 2), numbers only", n === 2 && ticks === "1/2,2/2" &&
      forDevice(id, "select bool_and(array(select jsonb_object_keys(data)) <@ array['run','rid','home_screen','test','ticked','total']) from events where device_id = $ID and kind = 'tasks_ticked'") === "t", ticks);
    ok("ticks: task_ticks reads the highest (2 of 2)", forDevice(id, "select ticked || '/' || total from task_ticks where device_id = $ID") === "2/2");
    // Two routines the same day: two runs, one day
    await x.p.click("#again"); await x.t(700); await S.skipBreathing(x); await S.skipTasks(x); await drain(x);
    ok("two routines on one day stay two routines", forDevice(id, "select count(*) from routine_runs where device_id = $ID") === "2");
    const day = forDevice(id, "select routines || '/' || started || '/' || core from routine_days where device_id = $ID");
    ok("...and count as one day", day === "2/true/true", day);
    await x.c.close(); }

  // Rows queued by older versions (no event_id, a missing column) go in, each once; a bad row doesn't block the rest
  { const dev = "5e5e5e5e-1111-4222-8333-444455556666";
    const today = new Date().toISOString().slice(0, 10);
    const x = await open({ init: ([dev, today]) => {
      if (localStorage.getItem("fl.seeded")) return;
      localStorage.setItem("fl.seeded", "1");
      localStorage.setItem("fl.deviceId", JSON.stringify(dev));
      localStorage.setItem("fl.agreed", JSON.stringify({ version: "beta-5", on: today, how: "begin" }));
      localStorage.setItem("fl.outbox", JSON.stringify([
        // beta-2 shapes (the live app today)
        { device_id: dev, day: today, kind: "setup_done", data: { habit: "social", doors: ["gmail"], own_apps: 0, skipped: false, from: "redditads", home_screen: false }, app_version: "beta-2" },
        { device_id: dev, day: today, kind: "morning_done", data: { breathe: "done", ticked: 2, reshuffles: 0, own_moves: false, intention: true, note: false, minutes: 4, streak: 1, habit: "social", home_screen: false } },
        // a row no version should send: free text. It is refused; the others still go in
        { device_id: dev, day: today, kind: "door_open", data: { app: "Call mum about Sunday" }, app_version: "beta-2" },
        // beta-4 shape
        { device_id: dev, day: today, kind: "intention_saved", data: { run: 1, home_screen: false, count: 2, kept_defaults: true, own: false }, app_version: "beta-4" }]));
    }, initArg: [dev, today] });
    await x.goto(); await drain(x);
    await x.p.reload(); await x.t(700); await drain(x);
    const got = forDevice(dev, "select string_agg(kind || ':' || coalesce(app_version, '-'), ',' order by kind) from events where device_id = $ID");
    ok("older queued rows are stored once each (event_ids added, missing column filled)", got === "intention_saved:beta-4,morning_done:-,setup_done:beta-2", got);
    ok("...the free-text row was refused and dropped, not retried", forDevice(dev, "select count(*) from events where device_id = $ID and kind = 'door_open'") === "0" &&
      ((await x.ls("outbox")) || []).length === 0);
    await x.c.close(); }

  // The app's key (anon) over HTTP, as anyone could use it
  { const get = (p) => fetch(api.base + p).then((r) => r.status);
    const send = (method, p, body) => fetch(api.base + p, { method, headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: body && JSON.stringify(body) }).then((r) => r.status);
    const reads = await Promise.all(["/events", "/events?select=event_id", "/excluded_devices", "/retention_report", "/routine_cohort", "/legacy_retention_report", "/testers"].map(get));
    ok("anon can't read the table, the private list or any report over HTTP", reads.every((s) => s === 401 || s === 403), reads);
    ok("anon can't change or delete rows", [await send("PATCH", "/events?kind=eq.routine_started", { kind: "rating" }), await send("DELETE", "/events")].every((s) => s === 401 || s === 403));
    ok("the payload check isn't callable as an API function", (await send("POST", "/rpc/event_payload_ok", { p_kind: "x", p_data: {}, p_version: null })) === 404);
    const today = new Date().toISOString().slice(0, 10);
    ok("a row with task text is refused (400)", (await send("POST", "/events", [{ device_id: "7a7a7a7a-1111-4222-8333-444455556666", day: today, kind: "tasks_saved", data: { count: 1, text: "Call mum" } }])) === 400);
    ok("an unknown kind is refused (400)", (await send("POST", "/events", [{ device_id: "7a7a7a7a-1111-4222-8333-444455556666", day: today, kind: "anything", data: {} }])) === 400);
    ok("a valid row is accepted (201)", (await send("POST", "/events", [{ event_id: "7a7a7a7a-0000-4000-8000-000000000001", device_id: "7a7a7a7a-1111-4222-8333-444455556666", day: today, kind: "app_installed", data: { run: 0, home_screen: false }, app_version: "beta-5" }])) === 201);
    ok("the same event_id again is accepted and skipped (201, still one row)", (await send("POST", "/events", [{ event_id: "7a7a7a7a-0000-4000-8000-000000000001", device_id: "7a7a7a7a-1111-4222-8333-444455556666", day: today, kind: "app_installed", data: { run: 0, home_screen: false }, app_version: "beta-5" }])) === 201 &&
      query(db, "select count(*) from events where event_id = '7a7a7a7a-0000-4000-8000-000000000001'") === "1");
    ok("created_at can't be set by the app (401/403)", [401, 403].includes(await send("POST", "/events", [{ device_id: "7a7a7a7a-1111-4222-8333-444455556666", day: today, kind: "app_installed", data: {}, created_at: "2020-01-01T00:00:00Z" }])));
  }

  await b.close(); await site.close(); api.stop();
  done();
})();
