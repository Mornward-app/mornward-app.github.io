// Issue 7 (the counts choice controls sending, from the first screen) and the link audit from issue 3
// (no anonymous ID in links that leave the phone; the iPhone icon's continuity token).
// Run: node tests/e2e/privacy.test.js   (see tests/README.md)
const fs = require("fs");
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter } = require("./helpers");
const { ok, done } = reporter("privacy: counts choice, queue, links");
const WHEN = "2026-10-05T07:10:00";
async function drain(x) { for (let i = 0; i < 40 && ((await x.ls("outbox")) || []).length; i++) { await x.t(100); await x.p.waitForTimeout(50); } }
const SECRET = "Call mum about Sunday";

(async () => {
  const site = await serve();
  const b = await chromium.launch();

  // Nothing is sent before Begin
  { const x = await ctx(b, site.url, { when: WHEN }); await x.goto(); await x.t(5000); await x.p.waitForTimeout(300);
    ok("7 first visit: no request at all before Begin", x.bodies.length === 0);
    // Turned off before starting: the whole routine sends nothing
    await x.p.click("#preToggle"); await x.t(100);
    ok("7 the choice is on the first screen and says off", /counts off/.test(await x.p.textContent("#preStats")));
    await S.begin(x); await S.breatheAll(x); await S.untickAll(x); await x.p.fill("#intent", SECRET); await S.keep(x); await S.finish(x);
    await x.p.waitForTimeout(500);
    ok("7 off from the start: no request, nothing queued, no ID made", x.bodies.length === 0 && ((await x.ls("outbox")) || []).length === 0 && !(await x.ls("deviceId")));
    await x.c.close(); }

  // Off after events were queued (the network was down): the queue is dropped, never sent later
  { let down = true;
    const x = await ctx(b, site.url, { when: WHEN, status: () => (down ? 503 : 201) }); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x); await x.p.waitForTimeout(300);
    ok("7 network down: the routine's rows wait in the queue", ((await x.ls("outbox")) || []).length === 4);
    await x.p.click("#privSec summary"); await x.p.click("#statsToggle"); await x.t(100);
    ok("7 turning the counts off empties the queue", ((await x.ls("outbox")) || []).length === 0);
    down = false; const before = x.bodies.length;
    await x.p.evaluate(() => window.dispatchEvent(new Event("online"))); await x.p.reload(); await x.t(700);
    await x.p.click("#again"); await x.t(700); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x); await x.p.waitForTimeout(500);
    ok("7 while off: back online, a reload and another routine send nothing", x.bodies.length === before && ((await x.ls("outbox")) || []).length === 0);
    // Back on: only what happens from now on is sent; the routine done while off is never backfilled
    await x.p.click("#privSec summary"); await x.p.click("#statsToggle"); await x.t(100);
    await x.p.click("#again"); await x.t(700); await S.skipBreathing(x); await x.p.fill("#intent", SECRET); await S.keep(x); await drain(x);
    const runs = [...new Set(x.rows().map((r) => r.data.run))];
    ok("7 back on: only the new routine (run 3) is sent; runs 1 and 2 never are", JSON.stringify(runs) === "[3]", runs);
    ok("7 ...and it isn't marked as a first visit", x.rows().every((r) => r.data.first !== true));
    ok("7 task text never appears in any request", x.bodies.every((bd) => !/mum|Sunday/i.test(bd)) && x.urls.every((u) => !/mum|Sunday/i.test(decodeURIComponent(u))));
    await x.c.close(); }

  // A send in flight while the counts are turned off and on again: the new rows survive (they used to be dropped)
  { let release; const gate = new Promise((r) => (release = r));
    const x = await ctx(b, site.url, { when: WHEN, hold: async (n) => { if (n === 0) await gate; } }); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x);
    await x.p.click("#privSec summary"); await x.p.click("#statsToggle"); await x.p.click("#statsToggle"); await x.t(100);
    await x.p.click("#again"); await x.t(700);
    release(); await x.p.waitForTimeout(300); await drain(x);
    const k = x.rows().map((r) => `${r.kind}#${r.data.run}`);
    ok("3 queue race: run 2's start is sent after the first send returns", k.includes("routine_started#2"), k);
    ok("3 queue race: rows dropped by turning the counts off stay dropped", !k.includes("routine_finished#1"), k);
    await x.c.close(); }

  // Links that leave the phone carry no anonymous ID
  { const x = await ctx(b, site.url, { when: WHEN }); await x.goto("?from=redditads"); await x.p.click("#installGuide .link[data-guide-close]").catch(() => {}); await x.t(300);
    await S.begin(x); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    const id = await x.ls("deviceId");
    await x.p.click("#remindSec summary"); await x.p.fill("#remAt", "06:30");
    const g = decodeURIComponent(await x.p.getAttribute("#remGoogle", "href"));
    ok("3 Google Calendar link: no ID (Google receives this text)", !g.includes(id) && !g.includes("#r=") && g.includes("https://mornward.app/?via=calendar"));
    await x.p.click("#remMore summary"); await x.p.click('[data-rem-os="ios"]');
    const href = await x.p.getAttribute("#remIcs", "href"); const ics = await (await x.p.request.get(new URL(href, x.p.url()).href)).text();
    ok("3 calendar file: the same file for everyone at that time (cal/0630.ics), no ID", href === "cal/0630.ics" && !ics.includes(id) && !ics.includes("#r=") && !/https?:|URL:/.test(ics));
    await x.p.click("#iedit").catch(() => {}); await x.p.click("#iskip").catch(() => {}); await x.t(700);
    await x.p.evaluate(() => localStorage.removeItem("fl.installNo")); await x.p.reload(); await x.t(700);
    await x.p.click("[data-install-add]"); await x.t(300); await x.p.click("#installGuide .cantfind summary"); await x.p.click("[data-copy-link]"); await x.t(100);
    const cp = await x.p.evaluate(() => navigator.clipboard.readText());
    ok("3 'Copy link' in the add guide: the link source only", cp === "https://mornward.app/?from=redditads", cp);
    await x.c.close(); }

  // iPhone: the icon's start address is the one place the ID is carried, and only with counts on
  for (const off of [false, true]) {
    const x = await ctx(b, site.url, { when: WHEN, device: "iPhone 13" }); await x.goto();
    if (off) { await x.p.click("#preToggle"); await x.t(100); }
    await S.begin(x); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    await x.p.click("[data-install-add]"); await x.t(300);
    const href = await x.p.getAttribute('link[rel="manifest"]', "href");
    const m = JSON.parse(decodeURIComponent(href.replace("data:application/manifest+json,", "")));
    const carried = JSON.parse(decodeURIComponent(m.start_url.split("#r=")[1]));
    const id = await x.ls("deviceId");
    if (!off) ok("3 iPhone icon start address: ID, terms version, choice and two yes/no flags (no tasks, answers, source or alarm time)",
      JSON.stringify(Object.keys(carried).sort()) === '["e","i","o","s","t","v"]' && carried.i === id && carried.s === 0 && [0, 1].includes(carried.e) && [0, 1].includes(carried.o), carried);
    else ok("3 iPhone icon with counts off: no ID carried at all", !("i" in carried) && carried.s === 1, carried);
    await x.c.close();
  }

  // Carrying in: a reminder link from an earlier version still keeps the same person; a copied address doesn't
  { const old = encodeURIComponent(JSON.stringify({ v: 1, i: "3f2a9c00-1111-4222-8333-444455556666", t: "beta-5", s: 0, a: "06:30", f: "reddit" }));
    const x = await ctx(b, site.url, { when: WHEN }); await x.goto("?via=calendar#r=" + old);
    ok("3 an older reminder link (ID after #) is still accepted, then removed from the address", (await x.ls("deviceId")) === "3f2a9c00-1111-4222-8333-444455556666" && !(await x.p.evaluate(() => location.hash)));
    await x.c.close();
    const y = await ctx(b, site.url, { when: WHEN }); await y.goto("#r=" + old);
    ok("3 a copied address with an ID is not adopted", (await y.ls("deviceId")) === null);
    await y.c.close(); }

  await b.close(); await site.close();
  done();
})();
