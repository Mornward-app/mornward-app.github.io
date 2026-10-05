// Regressions for the bugs the independent QA passes found in setup-first onboarding (code review, adversarial
// journeys, accessibility, privacy). Each check reproduces the original report.
// Run: node tests/e2e/onboarding-regressions.test.js
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter } = require("./helpers");
const { ok, done } = reporter("onboarding regressions (QA findings)");
const SUN_EVE = "2026-10-04T20:30:00", MON = "2026-10-05T07:05:00";
const h1 = (x) => x.p.innerText("h1").then((t) => t.replace(/\s+/g, " ").trim());
const click = async (x, sel) => { await x.p.click(sel); await x.t(700); };
async function drain(x) { for (let i = 0; i < 40 && ((await x.ls("outbox")) || []).length; i++) { await x.t(100); await x.p.waitForTimeout(50); } }
async function jump(x, when) { await x.p.clock.setSystemTime(new Date(when)); await x.p.reload(); await x.t(700); }
const toStep3 = async (x) => { await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext"); };
const failing = () => {
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (window.__fail && window.__fail.includes(String(k).slice(3))) throw new DOMException("full", "QuotaExceededError");
    return set.call(this, k, v);
  };
};

(async () => {
  const site = await serve();
  const b = await chromium.launch();
  const open = (opt = {}) => ctx(b, site.url, { when: SUN_EVE, ...opt });

  // Journey 1: a slow double-tap on step 3's Continue landed on "Begin your reset" and started a routine
  for (const device of ["iPhone 13", "Pixel 7"]) {
    const x = await open({ device }); await x.goto(); await toStep3(x);
    const box = await x.p.locator("#stepNext").boundingBox();
    await x.p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await x.t(600);
    await x.p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await x.t(700);
    await x.p.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await x.t(700);
    ok(`double/triple tap on Continue (${device}): no routine starts during setup`, !(await x.ls("routine")) && !(await x.ls("startDay")) && !(await x.p.$("#bpause")));
    // (the stray taps land on "Done for now", the harmless next step; Begin there waits for a settled tap)
    await x.t(1500); await x.p.click((await x.p.$("#beginNow")) ? "#beginNow" : "#begin"); await x.t(700);
    ok(`...a deliberate tap a moment later still begins (${device})`, !!(await x.p.$("#bpause")));
    await x.c.close();
  }

  // Journey 2: step 3's time and date were lost on reload and at midnight
  { const x = await open({ when: "2026-10-04T23:58:30" }); await x.goto(); await toStep3(x);
    await x.p.fill("#remAt", "06:15"); await x.p.fill("#remDate", "2026-10-07"); await x.p.dispatchEvent("#remDate", "change");
    await x.p.reload(); await x.t(700);
    ok("reload on step 3: time and first date kept", (await x.p.inputValue("#remAt")) === "06:15" && (await x.p.inputValue("#remDate")) === "2026-10-07" &&
      /Wednesday, October 7 at 6:15/.test(await x.p.textContent("#remWhen")));
    await x.t(120000); // past midnight
    ok("midnight on step 3: the screen isn't redrawn; choices kept", (await x.p.inputValue("#remAt")) === "06:15" && (await h1(x)) === "Make room for your first morning.");
    await x.c.close(); }

  // Journey 3 / review 3: a failed save on step 1 moved on silently and lost the choice
  { const x = await open({ init: failing }); await x.goto(); await click(x, "#setupGo");
    await x.p.evaluate(() => { window.__fail = ["onboard"]; });
    await x.p.click('[data-app="reddit"]'); await click(x, "#stepNext");
    ok("step 1 can't save: stays, says so, offers Retry, choice still shown", (await h1(x)) === "Where does your morning scroll usually start?" &&
      (await x.p.textContent("#stepNext")) === "Retry" && /Couldn't save/.test(await x.p.textContent("#stepMsg")) &&
      (await x.p.getAttribute('[data-app="reddit"]', "aria-pressed")) === "true");
    await x.p.evaluate(() => { window.__fail = []; }); await click(x, "#stepNext");
    ok("...Retry saves it and moves on", (await h1(x)) === "What would you like to make room for?" && (await x.ls("onboard")).apps[0] === "reddit");
    await x.c.close(); }
  { const x = await open({ init: failing }); await x.goto();
    await x.p.evaluate(() => { window.__fail = ["onboard"]; }); await click(x, "#setupGo");
    ok("setup can't be saved at all: Welcome says so and offers Begin now", (await h1(x)) === "A calmer start, before the scroll." && /isn't saving/.test(await x.p.textContent("#welcomeMsg")));
    await x.c.close(); }

  // Journey 4: a typed task ending in " ·" split into a broken extra task on the first morning
  { const x = await open(); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    await S.untickAll(x); await x.p.click(".chip.pick >> nth=0"); await x.p.fill("#prepIntent", "Read · then nap ·"); await click(x, "#stepNext");
    ok("trailing ' ·' is cleaned", (await x.ls("prepared")).tasks[1] === "Read, then nap", (await x.ls("prepared")).tasks);
    await click(x, "#stepNext"); await click(x, "#setupDone");
    await jump(x, MON); await S.begin(x); await S.skipBreathing(x); await x.p.click(".chip.pick:not([aria-pressed=true]) >> nth=0"); await S.keep(x);
    const rows = await x.p.$$eval("#itext li", (l) => l.map((e) => e.textContent));
    ok("...first morning saves three clean tasks", rows.length === 3 && rows.every((r) => !r.startsWith("·") && !r.endsWith("·")), rows);
    await x.c.close(); }

  // Journey 5 + 6: a stale tab re-armed used setup tasks / overwrote today's routine
  { const x = await open(); await x.goto(); await toStep3(x); await click(x, "#stepNext"); await click(x, "#setupDone");
    const tabA = x.p;
    const tabB = await x.c.newPage(); await tabB.clock.install({ time: new Date(MON) }); await tabB.goto(site.url); await tabB.clock.runFor(700);
    await x.p.clock.setSystemTime(new Date(MON));
    await tabB.click("#begin"); await tabB.clock.runFor(700); await tabB.click("#bskip"); await tabB.clock.runFor(700);
    await tabB.click("#isave"); await tabB.clock.runFor(700); await tabB.click("#finish"); await tabB.clock.runFor(700);
    await tabA.clock.runFor(2000);
    await tabA.click("#setupEdit"); await x.t(700);
    ok("stale tab: Edit setup after a routine started goes to Begin/Today instead", !(await tabA.$("#apps")) && !!(await tabA.$("#again, #begin")));
    await tabA.reload(); await x.t(700);
    ok("...and the setup tasks stay used", (await x.ls("prepared")).used === true);
    await tabA.click("#again").catch(() => {}); await x.t(700);
    const r = await x.ls("routine");
    ok("stale tab Begin: a new run number (no overwrite of today's routine)", r.run === 2, r);
    await x.c.close(); }

  // Journey 7: storage failing as the setup tasks are marked used
  { const x = await open({ init: failing }); await x.goto(); await toStep3(x); await click(x, "#stepNext"); await click(x, "#setupDone");
    await jump(x, MON); await S.begin(x); await S.skipBreathing(x);
    await x.p.evaluate(() => { window.__fail = ["prepared"]; }); await S.keep(x);
    await x.p.evaluate(() => { window.__fail = []; });
    await S.finish(x); await jump(x, "2026-10-06T07:00:00"); await S.begin(x); await S.skipBreathing(x);
    ok("setup tasks can't be marked used: they're removed instead, not offered again", /Two picked to start/.test(await x.p.textContent("#pickHint")));
    await x.c.close(); }

  // Review 1: an older link (no `e`) from someone with counts off sent them into setup
  { const old = encodeURIComponent(JSON.stringify({ v: 1, t: "beta-5", s: 1 }));
    const x = await open(); await x.goto("?via=calendar#r=" + old);
    ok("older reminder link with counts off: Begin, not Welcome", !!(await x.p.$("#begin")) && !(await x.p.$("#setupGo")));
    await x.c.close(); }

  // Review 2 + privacy 2: the iPhone icon address said "setup done" mid-setup, and wasn't refreshed after setup
  { const x = await open({ device: "iPhone 13" }); await x.goto();
    const carried = async () => { const href = await x.p.getAttribute('link[rel="manifest"]', "href");
      if (!href.startsWith("data:")) return null;
      const m = JSON.parse(decodeURIComponent(href.replace("data:application/manifest+json,", "")));
      return m.start_url.includes("#r=") ? JSON.parse(decodeURIComponent(m.start_url.split("#r=")[1])) : null; };
    await toStep3(x);
    const mid = await carried();
    ok("icon address mid-setup: o = 0 (setup not done)", mid && mid.o === 0, mid);
    await click(x, "#stepNext");
    const after = await carried();
    ok("icon address right after setup (no reload): o = 1", after && after.o === 1 && after.e === 0, after);
    await x.c.close(); }

  // Review: Skip reminder kept an old "planned first morning"
  { const x = await open(); await x.goto(); await toStep3(x);
    await x.p.click("#remGoogle"); await x.t(300);
    for (const p of x.c.pages().slice(1)) await p.close();
    await click(x, "#stepSkip");
    ok("Skip reminder after a calendar tap: no planned date shown", !(await x.p.$("#planned")) && !(await x.ls("remPlan")));
    await x.c.close(); }

  // Review risk: tasks_saved carries `prepared` only when setup tasks were offered (older databases accept it)
  { const x = await open({ when: MON }); await x.goto(); await S.begin(x); await S.skipBreathing(x); await S.keep(x); await drain(x);
    ok("tasks_saved without setup tasks has no `prepared` key", !("prepared" in x.rows().find((r) => r.kind === "tasks_saved").data));
    await x.c.close(); }

  // Accessibility: 200% text at 320 px: the bottom buttons stop sticking; nothing is cut off; Today fits
  { const x = await open({ device: "iPhone SE", init: () => { document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = "200%"; }); } });
    await x.goto(); await click(x, "#setupGo");
    ok("200% text, 320 px: the bottom buttons sit at the end instead of covering a quarter of the screen", await x.p.$eval(".actions.sticky", (e) => e.classList.contains("unstick")));
    await x.p.focus('[data-app="other"]');
    const covered = await x.p.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); const bar = document.querySelector(".actions.sticky").getBoundingClientRect(); return r.bottom > bar.top && r.top < bar.bottom && getComputedStyle(document.querySelector(".actions.sticky")).position === "sticky"; });
    ok("...a focused choice isn't hidden under them", !covered);
    await click(x, "#stepNext"); await click(x, "#stepNext");
    const clipped = await x.p.$$eval(".seg button", (l) => l.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    ok("...the iPhone / Android switch isn't cut off", clipped.length === 0, clipped);
    await click(x, "#stepNext"); await click(x, "#setupDone"); await x.t(1300); await S.begin(x); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    ok("...Today fits without sideways scrolling", await x.p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1));
    await x.c.close(); }
  { const x = await open(); await x.goto(); await click(x, "#setupGo");
    const narrow = await x.p.$$eval("[data-app]", (l) => l.filter((e) => e.getBoundingClientRect().width < 44).map((e) => e.textContent.trim()));
    ok("the 'X' choice is at least 44 px wide", narrow.length === 0, narrow);
    await x.c.close(); }

  await b.close(); await site.close();
  done();
})();
