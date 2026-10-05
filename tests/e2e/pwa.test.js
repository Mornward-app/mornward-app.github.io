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
    await x.c.setOffline(false);
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
    await x.p.click("[data-install-add]"); await x.t(300); await x.p.click("#installGuide [data-guide-close].primary"); await x.t(300); await drain(x);
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
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => { navigator.getInstalledRelatedApps = () => Promise.resolve([]); } });
    await x.goto(); await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await S.finish(x);
    const line = await x.p.textContent("#installBox");
    ok("not reported as installed: the box offers, without claiming it isn't installed", !!(await x.p.$("[data-install-add]")) && !/not installed|isn't installed/i.test(line));
    await x.c.close(); }

  // Preview vs production
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => { window.MORNWARD_PREVIEW = true; } });
    await x.goto(); await S.begin(x); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    await x.p.click("#tdTab"); await x.t(300); await x.p.click("#pvNext"); await x.t(700);
    await S.begin(x); await S.skipBreathing(x); await S.keep(x); await x.p.waitForTimeout(500);
    ok("preview: Test drive works (a pretend next day)", (await x.ls("days")).length === 2);
    ok("preview: nothing at all is sent, whatever is tapped", x.bodies.length === 0 && ((await x.ls("outbox")) || []).length === 0);
    await x.c.close(); }
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", viewport: null }); await x.goto();
    ok("production: no Test drive tab", !(await x.p.$("#tdTab")));
    const html = require("fs").readFileSync(require("path").join(ROOT, "index.html"), "utf8");
    ok("production: the phone card's link is the real site", html.includes('const PHONE_URL = "https://mornward.app/?from=qr";') && !/claude\.ai\/artifact/.test(html));
    await x.c.close(); }

  await b.close(); await site.close();
  done();
})();
