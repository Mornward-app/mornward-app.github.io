// Issue 10: service-worker update and offline behaviour, install prompts, preview vs production, and existing users
// upgrading (from the live beta-2 app's storage, and from the beta-4 build with its old service worker).
// Desktop Chromium emulation only; real phones: docs/real-device-checklist.md.
// Run: node tests/e2e/pwa.test.js
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter, ROOT } = require("./helpers");
const { ok, done } = reporter("pwa: updates, offline, install prompts, preview, upgrades");
const git = (ref) => { try { return execFileSync("git", ["show", ref], { cwd: ROOT }); } catch { return null; } };
async function drain(x) { for (let i = 0; i < 40 && ((await x.ls("outbox")) || []).length; i++) { await x.t(100); await x.p.waitForTimeout(50); } }
const cacheKeys = (p) => p.evaluate(() => caches.keys());
const swReady = (p) => p.evaluate(() => navigator.serviceWorker.ready.then(() => true));

(async () => {
  const site = await serve();
  const b = await chromium.launch();

  // Upgrade with the service worker: the beta-4 build (previous commit's index.html + sw.js), then this version
  const oldIndex = git("fe89b4c:index.html"), oldSw = git("fe89b4c:sw.js");
  if (oldIndex && oldSw) {
    site.override("/index.html", oldIndex); site.override("/sw.js", oldSw);
    const x = await ctx(b, site.url, { serviceWorkers: "allow" }); await x.goto(); await swReady(x.p);
    await S.begin(x); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    const today = new Date().toISOString().slice(0, 10);
    const before = { tasks: await x.ls("intent:" + today), days: await x.ls("days"), id: await x.ls("deviceId") };
    ok("upgrade: the old version is installed with its cache", JSON.stringify(await cacheKeys(x.p)) === '["mornward-v3"]');
    site.override("/index.html", null); site.override("/sw.js", null);
    await x.p.reload(); await x.p.waitForTimeout(1500); await x.p.reload();
    // activation (which removes the old cache) finishes a moment after the new worker takes control
    let keys = [];
    for (let i = 0; i < 50; i++) { keys = await cacheKeys(x.p); if (JSON.stringify(keys) === '["mornward-v4"]') break; await x.p.waitForTimeout(200); }
    ok("upgrade: the new worker takes over and removes only its old cache", JSON.stringify(keys) === '["mornward-v4"]', keys);
    ok("upgrade: the page now runs the new version", (await x.p.evaluate(() => document.documentElement.innerHTML.includes("Your progress"))));
    ok("upgrade: today's tasks, the days and the ID are untouched", (await x.ls("intent:" + today)) === before.tasks && JSON.stringify(await x.ls("days")) === JSON.stringify(before.days) && (await x.ls("deviceId")) === before.id);
    ok("upgrade: reopening shows Today (the old routine record still reads), not Begin or onboarding", !!(await x.p.$("#again")));
    ok("upgrade: a day finished on the old version is not turned into a full routine", !(await x.ls("fullDays")) && (await x.p.$eval(".progress li.now", (l) => l.className)) === "part now");

    // Offline: the saved copy opens; so do the terms
    await x.c.setOffline(true);
    await x.p.reload(); await x.p.waitForTimeout(500);
    ok("offline: reopening works from the saved copy", !!(await x.p.$("#again")));
    await x.p.goto(site.url + "terms.html").catch(() => {});
    ok("offline: the terms page opens too", /Terms and privacy/.test(await x.p.title()));
    await x.p.goto(site.url + "?via=calendar").catch(() => {});
    ok("offline: an address with a query (a reminder link) still opens the app", !!(await x.p.$("#card")));
    const calOff = await x.p.evaluate(() => fetch("cal/0630.ics").then((r) => r.text().then((t) => t.slice(0, 15)), () => "network error"));
    ok("offline: a calendar file is never answered with the app page (the worker leaves cal/ alone)", calOff === "network error", calOff);
    await x.c.setOffline(false);
    const calOn = await x.p.evaluate(() => fetch("cal/0630.ics").then((r) => r.text()));
    ok("online: the calendar file arrives as itself", calOn.startsWith("BEGIN:VCALENDAR") && calOn.includes("mornward-0630@mornward.app"));
    // Weak signal: the page takes 10 s; the saved copy shows after about 4 s
    site.slowPages(10000);
    const t0 = Date.now(); await x.p.goto(site.url, { waitUntil: "domcontentloaded" }); const ms = Date.now() - t0;
    ok("slow network: the saved copy shows after the 4 s timeout, not after 10 s", ms >= 3500 && ms < 8000 && !!(await x.p.$("#card")), ms + " ms");
    site.slowPages(0);
    await x.c.close();
  } else ok("upgrade with the old service worker: skipped (commit fe89b4c not in this checkout)", true);

  // Upgrade from the live beta-2 app's storage (the shapes beta-2 writes)
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => {
      if (localStorage.getItem("fl.seeded")) return; localStorage.setItem("fl.seeded", "1");
      const set = (k, v) => localStorage.setItem("fl." + k, JSON.stringify(v));
      set("deviceId", "b2b2b2b2-1111-4222-8333-444455556666");
      set("agreed", { version: "beta-2", on: "2026-09-28" });
      set("setup", { done: true, habit: "social", doors: ["gmail"] });
      set("intent:2026-10-03", "Call the bank");
      set("streak", { last: "2026-10-03", count: 2 });
      set("outbox", [{ device_id: "b2b2b2b2-1111-4222-8333-444455556666", day: "2026-10-04", kind: "morning_start", data: { habit: "social", home_screen: false }, app_version: "beta-2" }]);
    } });
    await x.goto();
    ok("from beta-2: opens on Begin, with the new terms note to agree (no old onboarding)", !!(await x.p.$("#begin")) && !!(await x.p.$("#consent")));
    ok("from beta-2: earlier mornings show as reached-the-end marks, never as full routines", (await x.p.$$(".progress li.part")).length === 2 && (await x.p.$$(".progress li.full")).length === 0);
    ok("from beta-2: the old task is kept, dated, under Earlier tasks", /Call the bank/.test(await x.p.textContent("#earlier")));
    ok("from beta-2: nothing was sent before agreeing to the new terms", x.bodies.length === 0);
    await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await drain(x);
    const st = x.rows().find((r) => r.kind === "routine_started");
    ok("from beta-2: the first new routine isn't marked as a first visit", st && st.data.first !== true);
    ok("from beta-2: the old queued row is sent too, with an event_id", x.rows().some((r) => r.kind === "morning_start" && /^[0-9a-f-]{36}$/.test(r.event_id)));
    await x.c.close(); }

  // Install prompts
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00" }); await x.goto();
    ok("install: no box before the first routine", !(await x.p.$("#installBox")));
    await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x);
    ok("install: offered on Today after the first routine", !!(await x.p.$("#installBox")));
    await x.p.click("[data-install-add]"); await x.t(300); await x.p.click("#installGuide .link[data-guide-close]"); await x.t(300); await drain(x);
    ok("install: opening the add guide counts nothing (not an installation)", x.rows().every((r) => !/install/.test(r.kind)));
    await x.p.click("[data-install-later]"); await x.t(200);
    ok("install: ✕ removes the box; a quiet row stays", !(await x.p.$("#installBox")) && !!(await x.p.$("#addSec")));
    await x.p.reload(); await x.t(700);
    ok("install: dismissal is remembered after a reload", !(await x.p.$("#installBox")) && !!(await x.p.$("#addSec")));
    await x.c.close(); }
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q));
    } });
    await x.goto(); await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x); await drain(x);
    ok("home screen: opened from the icon, no add box anywhere", !(await x.p.$("#installBox")) && !(await x.p.$("#addSec")));
    ok("home screen: rows say home_screen: true", x.rows().every((r) => r.data.home_screen === true));
    await x.c.close(); }
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => { navigator.getInstalledRelatedApps = () => Promise.resolve([{ platform: "webapp" }]); } });
    await x.goto(); await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x); await drain(x);
    ok("installed, opened in the browser (Chrome reports it): the box stays away, nothing counted", !(await x.p.$("[data-install-add]")) && x.rows().every((r) => !/install/.test(r.kind)));
    await x.c.close(); }
  // Once on the home screen, nothing asks again — iPhone: "I've added it" in the steps
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", device: "iPhone 13" }); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x);
    ok("added once (iPhone): a new visitor is offered the box after the first routine", !!(await x.p.$("#installBox")));
    await x.p.click("[data-install-add]"); await x.t(300);
    ok("added once (iPhone): the steps have 'I've added it' and 'Not yet'", (await x.p.textContent("#installGuide [data-guide-added]")) === "I've added it" &&
      (await x.p.textContent("#installGuide .link[data-guide-close]")) === "Not yet");
    await x.p.click("#installGuide [data-guide-added]"); await x.t(300); await drain(x);
    ok("added once (iPhone): 'I've added it' removes every offer at once (box and quiet row)", !(await x.p.$("#installBox")) && !(await x.p.$("#addSec")) && !(await x.p.$("#installGuide")));
    ok("added once (iPhone): it's only noted on the phone, not counted as an install", (await x.ls("homeAdded")).how === "self" && x.rows().every((r) => !/install/.test(r.kind)));
    await x.p.reload(); await x.t(700);
    ok("added once (iPhone), opened again in Safari: 'Mornward lives on your home screen.'", /lives on your home screen/.test(await x.p.innerText("h1")));
    await x.p.click("#safariHere"); await x.t(700);
    ok("added once (iPhone): Continue here: still no offer", !(await x.p.$("#installBox")) && !(await x.p.$("#addSec")));
    await x.p.clock.setSystemTime(new Date("2026-10-06T07:10:00")); await x.p.reload(); await x.t(700);
    ok("added once (iPhone): the next morning's Begin doesn't offer it either", !!(await x.p.$("#begin")) && !(await x.p.$("#installBox")));
    await x.c.close(); }
  // Android: opened from the icon once, then in Chrome (same storage): no offer in Chrome
  { const a = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q));
    } });
    await a.goto(); const state = await a.c.storageState(); await a.c.close();
    const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", storageState: state }); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x);
    ok("added once (Android): after opening it from the icon, Chrome offers nothing", !(await x.p.$("#installBox")) && !(await x.p.$("#addSec")) && (await x.ls("homeAdded")).how === "opened");
    await x.c.close(); }
  // Chrome reported it once: remembered, even when Chrome stops reporting
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => {
      navigator.getInstalledRelatedApps = () => Promise.resolve(localStorage.getItem("fl.reported") ? [] : (localStorage.setItem("fl.reported", "1"), [{ platform: "webapp" }])); } });
    await x.goto(); await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x);
    await x.p.reload(); await x.t(700);
    ok("added once (Chrome reported it): remembered on later visits", !(await x.p.$("#installBox")) && (await x.ls("homeAdded")).how === "detected");
    await x.c.close(); }
  // Setup's optional row and the QR steps also stay away once it's known
  { const x = await ctx(b, site.url, { when: "2026-10-05T20:00:00", device: "iPhone 13", init: () => { localStorage.setItem("fl.homeAdded", JSON.stringify({ how: "self", on: "2026-10-05" })); } });
    await x.goto("?from=qr"); await x.t(1000); await x.p.click("#setupGo"); await x.t(500);
    ok("added once (iPhone Safari, from the QR code), Prepare my morning: no steps, just 'Now open it from your home screen'", (await x.p.textContent("#guideTitle")) === "Now open it from your home screen" && !(await x.p.$("#guideSteps")));
    await x.goto(); await x.p.evaluate(() => localStorage.setItem("fl.browserOk", "true")); await x.goto(); await x.t(700);
    await x.p.click("#setupGo"); await x.t(700); await x.p.click("#stepNext"); await x.t(700);
    ok("added once: setup's 'Add to home screen · optional' row is gone", !(await x.p.$("#addSec")) && !!(await x.p.$("#remAt")));
    await x.c.close(); }
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => { navigator.getInstalledRelatedApps = () => Promise.resolve([]); } });
    await x.goto(); await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x);
    const line = await x.p.textContent("#installBox");
    ok("not reported as installed: the box offers, without claiming it isn't installed", !!(await x.p.$("[data-install-add]")) && !/not installed|isn't installed/i.test(line));
    await x.c.close(); }

  // Preview vs production
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => { window.MORNWARD_PREVIEW = true; } });
    await x.goto(); await S.begin(x); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    await x.p.click("#tdTab"); await x.t(300);
    ok("preview Test drive: Light/Dark only (no Auto), text size, what's kept, what's counted, Start over; no sample week",
      JSON.stringify(await x.p.$$eval("[data-td-theme]", (l) => l.map((e) => e.textContent))) === '["Light","Dark"]' &&
      (await x.p.$$("[data-td-textsize]")).length === 3 && !(await x.p.$("#pvWeek")) && !!(await x.p.$("#pvKept")) && !!(await x.p.$("#pvCounts")) && !!(await x.p.$("#pvReset")) &&
      !(await x.p.$("#pvNext")) && !(await x.p.$("#pvPhone")));
    await x.p.click('[data-td-theme="dark"]');
    ok("preview Test drive: Dark switches the app to dark", (await x.p.getAttribute("html", "data-theme")) === "dark");
    await x.p.click('[data-td-textsize="largest"]');
    ok("preview Test drive: Largest text makes the text bigger", (await x.p.evaluate(() => document.documentElement.style.fontSize)) === "150%");
    await x.p.click('[data-td-textsize="normal"]');
    await x.p.click("#pvCounts");
    const counted = await x.p.textContent("#pvOut");
    ok("preview Test drive: 'What would be counted' lists this routine in plain words, never the task text", /Started a routine/.test(counted) && /Saved 2 mini tasks \(not what they say\)/.test(counted) && /A full routine|Reached the end/.test(counted), counted);
    await x.p.click("#pvKept");
    ok("preview Test drive: 'What this phone keeps' in plain words", /Mini tasks for 1 day/.test(await x.p.textContent("#pvOut")) && /Your words never leave it/.test(await x.p.textContent("#pvOut")));
    ok("preview: nothing at all is sent, whatever is tapped", x.bodies.length === 0 && ((await x.ls("outbox")) || []).length === 0);
    await x.c.close(); }
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", viewport: null }); await x.goto();
    ok("production: follows the phone's light or dark setting until one is picked", !(await x.p.getAttribute("html", "data-theme")));
    const before = await x.p.evaluate(() => JSON.stringify(Object.keys(localStorage).filter((k) => !/theme|previewText/.test(k)).sort().map((k) => [k, localStorage.getItem(k)])));
    await x.p.click("#tdTab"); await x.t(300);
    ok("production Test drive: Theme and Text size only (nothing else, no made-up progress, no Start over)",
      JSON.stringify(await x.p.$$eval("[data-td-theme]", (l) => l.map((e) => e.textContent))) === '["Light","Dark"]' && (await x.p.$$("[data-td-textsize]")).length === 3 &&
      !(await x.p.$("#pvWeek")) && !(await x.p.$("#pvKept")) && !(await x.p.$("#pvCounts")) && !(await x.p.$("#pvReset")) && !(await x.p.$("#pvOut")));
    await x.p.click('[data-td-theme="dark"]'); await x.p.click('[data-td-textsize="large"]'); await x.t(200);
    ok("production Test drive: Dark and Large apply", (await x.p.getAttribute("html", "data-theme")) === "dark" && (await x.p.evaluate(() => document.documentElement.style.fontSize)) === "125%");
    await x.p.reload(); await x.t(700);
    ok("production Test drive: the picks are kept after a reload", (await x.p.getAttribute("html", "data-theme")) === "dark" && (await x.p.evaluate(() => document.documentElement.style.fontSize)) === "125%");
    const after = await x.p.evaluate(() => JSON.stringify(Object.keys(localStorage).filter((k) => !/theme|previewText/.test(k)).sort().map((k) => [k, localStorage.getItem(k)])));
    ok("production Test drive: changes nothing but the look (no routine, history or setup data touched)", before === after);
    const html = require("fs").readFileSync(require("path").join(ROOT, "index.html"), "utf8");
    ok("production: the phone card's link is the real site", html.includes('const PHONE_URL = "https://mornward.app/?from=qr";') && !/claude\.ai\/artifact/.test(html));
    await x.c.close(); }

  await b.close(); await site.close();
  done();
})();
