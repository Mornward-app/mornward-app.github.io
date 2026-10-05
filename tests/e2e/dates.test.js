// Issue 5: local days at midnight, month/year ends, daylight saving, a time-zone change, and that the preview's
// pretend dates never apply in production.
// Run: node tests/e2e/dates.test.js   (see tests/README.md)
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter } = require("./helpers");
const { ok, done } = reporter("dates: midnight, year end, daylight saving, travel");

const sentDays = (x, kind) => [...new Set(x.rows().filter((r) => r.kind === kind).map((r) => r.day))];
async function drain(x) { for (let i = 0; i < 40 && ((await x.ls("outbox")) || []).length; i++) { await x.t(100); await x.p.waitForTimeout(50); } }
async function fullRoutine(x) { await S.begin(x); await S.breatheAll(x); await S.keep(x); await drain(x); }
async function jump(x, when) { await x.p.clock.setSystemTime(new Date(when)); await x.p.reload(); await x.t(700); }
const summary = (x) => x.p.$eval(".wsum", (e) => e.innerText.replace(/\s+/g, " ").trim());

(async () => {
  const site = await serve();
  const b = await chromium.launch();

  // Midnight: started at 23:59:40, finished after midnight
  { const x = await ctx(b, site.url, { when: "2026-10-05T23:59:40+07:00", timezoneId: "Asia/Bangkok" }); await x.goto();
    await fullRoutine(x);
    ok("midnight: a routine belongs to the day it started", JSON.stringify(sentDays(x, "routine_finished")) === '["2026-10-05"]' &&
      JSON.stringify(await x.ls("fullDays")) === '["2026-10-05"]' && !!(await x.ls("intent:2026-10-05")));
    await S.finish(x);
    ok("midnight: after Finish it's a new day, so Begin (not yesterday's tasks as today's)", !!(await x.p.$("#begin")));
    ok("midnight: the strip shows yesterday's sun and today still to do", (await x.p.$eval(".week li:nth-child(6)", (l) => l.className)).includes("done") &&
      (await x.p.$eval(".week li:nth-child(7)", (l) => l.className)) === "now");
    await fullRoutine(x);
    ok("midnight: the new day's routine is its own day, run 1", JSON.stringify(await x.ls("fullDays")) === '["2026-10-05","2026-10-06"]' &&
      x.rows().filter((r) => r.kind === "routine_started" && r.day === "2026-10-06")[0].data.run === 1);
    await x.c.close(); }

  // A routine left unfinished before midnight can be finished soon after (under 3 hours), not the next morning
  { const x = await ctx(b, site.url, { when: "2026-10-05T23:50:00" }); await x.goto();
    await S.begin(x); await S.skipBreathing(x);
    await jump(x, "2026-10-06T01:30:00");
    ok("carry-over: 01:30, the routine from 23:50 is still open", !!(await x.p.$("#isave")) && (await x.ls("routine")).day === "2026-10-05");
    await jump(x, "2026-10-06T07:00:00");
    ok("carry-over: next morning, it's a fresh Begin", !!(await x.p.$("#begin")));
    await x.c.close(); }

  // Month and year end
  { const x = await ctx(b, site.url, { when: "2026-12-31T07:00:00" }); await x.goto();
    await fullRoutine(x); await S.finish(x);
    await jump(x, "2027-01-01T07:00:00");
    ok("year end: 1 January opens on Begin", !!(await x.p.$("#begin")));
    await S.begin(x); await S.breatheAll(x);
    ok("year end: today's task screen doesn't treat 31 December's tasks as today's", (await x.p.textContent("#pickHint")).startsWith("Two picked"));
    await S.keep(x); await drain(x); await S.finish(x);
    ok("year end: two full days, 2 of the last 7", JSON.stringify(await x.ls("fullDays")) === '["2026-12-31","2027-01-01"]' && /^29% 2 of the last 7 days/.test(await summary(x)), await summary(x));
    ok("year end: rows dated by local day", JSON.stringify(sentDays(x, "routine_finished")) === '["2026-12-31","2027-01-01"]');
    await x.p.click("#earlier summary");
    ok("year end: 31 December is under Earlier tasks, with its year", /December 31, 2026|31 December 2026/.test(await x.p.textContent("#earlier")), await x.p.textContent("#earlier .when"));
    await x.c.close(); }

  // Daylight saving: New York falls back on 1 Nov 2026 and springs forward on 14 Mar 2027
  for (const [label, times] of [
    ["fall back", ["2026-10-31T07:00:00-04:00", "2026-11-01T07:00:00-05:00", "2026-11-02T07:00:00-05:00"]],
    ["spring forward", ["2027-03-13T07:00:00-05:00", "2027-03-14T07:00:00-04:00", "2027-03-15T07:00:00-04:00"]]]) {
    const days = times.map((t) => t.slice(0, 10));
    const x = await ctx(b, site.url, { when: times[0], timezoneId: "America/New_York" }); await x.goto();
    for (const [i, t] of times.entries()) {
      if (i) await jump(x, t);
      await fullRoutine(x); await S.finish(x);
    }
    ok(`daylight saving (${label}): three mornings, three days, none doubled or skipped`, JSON.stringify(await x.ls("fullDays")) === JSON.stringify(days) &&
      JSON.stringify(sentDays(x, "routine_finished")) === JSON.stringify(days), await x.ls("fullDays"));
    ok(`daylight saving (${label}): 3 of the last 7 days`, /^43% 3 of the last 7 days/.test(await summary(x)), await summary(x));
    await x.c.close();
  }
  // A routine started at 23:55 the night before the clocks change, finished after midnight
  { const x = await ctx(b, site.url, { when: "2026-10-31T23:55:00-04:00", timezoneId: "America/New_York" }); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await jump(x, "2026-11-01T01:30:00-05:00");
    ok("daylight saving: at 01:30 on the change day (the repeated hour) the 23:55 routine is still open", !!(await x.p.$("#isave")));
    await S.keep(x); await drain(x);
    ok("daylight saving: ...and it's dated the day it started", JSON.stringify(sentDays(x, "routine_finished")) === '["2026-10-31"]');
    await x.c.close(); }

  // Time-zone change: Bangkok morning, then Los Angeles the same instant (still the day before there), then back east
  { const a = await ctx(b, site.url, { when: "2026-10-05T07:10:00+07:00", timezoneId: "Asia/Bangkok" }); await a.goto();
    await fullRoutine(a); await S.finish(a);
    const state = await a.c.storageState(); await a.c.close();
    const x = await ctx(b, site.url, { when: "2026-10-05T07:30:00+07:00", timezoneId: "America/Los_Angeles", storageState: state }); await x.goto();
    ok("travel west: it's 4 October here, so Begin; 5 October's record is kept as it was", !!(await x.p.$("#begin")) &&
      JSON.stringify(await x.ls("fullDays")) === '["2026-10-05"]' && !!(await x.ls("intent:2026-10-05")));
    await fullRoutine(x); await S.finish(x);
    ok("travel west: the routine here is dated 4 October, local; no day gets credit twice", JSON.stringify(await x.ls("fullDays")) === '["2026-10-04","2026-10-05"]' &&
      JSON.stringify(sentDays(x, "routine_finished")) === '["2026-10-04"]');
    ok("travel west: 4 October has its own tasks", (await x.ls("intent:2026-10-04")) !== null);
    const s2 = await x.c.storageState(); await x.c.close();
    const y = await ctx(b, site.url, { when: "2026-10-06T06:30:00+07:00", timezoneId: "Asia/Bangkok", storageState: s2 }); await y.goto();
    await fullRoutine(y); await S.finish(y);
    ok("back east: 6 October is a new day; history untouched", JSON.stringify(await y.ls("fullDays")) === '["2026-10-04","2026-10-05","2026-10-06"]');
    await y.c.close(); }

  // The preview's pretend date is ignored by the real app, even if it's left in storage
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => { localStorage.setItem("fl.previewShift", String(3 * 86400000)); } });
    await x.goto(); await fullRoutine(x);
    ok("production ignores a stored preview date shift", JSON.stringify(sentDays(x, "routine_started")) === '["2026-10-05"]' && !(await x.p.$("#tdTab")));
    await x.c.close(); }

  await b.close(); await site.close();
  done();
})();
