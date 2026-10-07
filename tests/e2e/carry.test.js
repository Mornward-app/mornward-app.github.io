// A setup made inside another app's built-in browser (Reddit's looks exactly like Safari on iPhone) lives in that
// browser's own storage. The alarm Shortcut's link and "Copy link for Safari" carry it (#r=) into the phone's own
// browser: the same anonymous ID, setup done, and the chosen suggested tasks as bank positions, never typed words.
// Run: node tests/e2e/carry.test.js
const { chromium } = require("playwright");
const { serve, ctx, reporter } = require("./helpers");
const { ok, done } = reporter("carry: Reddit's browser → Safari, the alarm link, the icon");
const EVE = "2026-10-04T20:30:00", MON = "2026-10-05T07:05:00";
const h1 = (x) => x.p.innerText("h1").then((t) => t.replace(/\s+/g, " ").trim());
const click = async (x, sel) => { await x.p.click(sel); await x.t(700); };
const clip = (x) => x.p.evaluate(() => navigator.clipboard.readText());
const local = (u) => { const l = new URL(u); return l.search + l.hash; };
const carried = (u) => JSON.parse(decodeURIComponent(new URL(u).hash.replace(/^#r=/, "")));

(async () => {
  const site = await serve();
  const b = await chromium.launch();
  const open = (o = {}) => ctx(b, site.url, { when: EVE, device: "iPhone 14", ...o });

  // Setup inside "Reddit's browser" (iPhone, from the ad: ?from=reddit), two suggestions and one typed task
  const x = await open(); await x.goto("?from=reddit"); await x.p.click("#installGuide .link[data-guide-close]").catch(() => {}); await x.t(300);
  await click(x, "#setupGo");
  await x.p.fill("#prepIntent", "Call Mum");
  await click(x, "#stepNext");
  const tasks = (await x.ls("prepared")).tasks;
  const id = await x.ls("deviceId");
  await click(x, "#stepNext");
  ok("Ready (from Reddit, on iPhone): 'Opened from Reddit?' with Copy link for Safari", (await h1(x)) === "Ready for your first morning." &&
    /Opened from Reddit\?/.test(await x.p.textContent("#moveCard")) && (await x.p.textContent("#moveCopy")) === "Copy link for Safari");
  await x.p.click("#moveCopy"); await x.t(200);
  const move = await clip(x);
  ok("the copy says what to do next", /Open Safari, paste it in the address bar/.test(await x.p.textContent("#moveMsg")));
  const r = carried(move);
  ok("the link: ?carry=1, the same ID, setup done, two bank positions; no typed words, no app answers", move.startsWith("https://mornward.app/?carry=1#r=") &&
    r.i === id && r.o === 1 && r.b === 1 && r.p.length === 2 && !/Call Mum|reddit|instagram/i.test(decodeURIComponent(move)), r);
  // The alarm Shortcut is gone, but links its earlier version made (?via=alarm#r=…) still carry the setup in
  const alarm = move.replace("?carry=1", "?via=alarm");
  await x.c.close();

  // Pasted into Safari (a new, empty browser) the same evening
  { const y = await open(); await y.goto(local(move));
    ok("Safari, pasted that evening: Ready with See you tomorrow, not Welcome", (await h1(y)) === "Ready for your first morning." && !!(await y.p.$("#seeYou")) && !(await y.p.$("#setupGo")));
    ok("...the same anonymous ID, and the two suggested tasks (the typed one stays behind)", (await y.ls("deviceId")) === id &&
      JSON.stringify((await y.ls("prepared")).tasks) === JSON.stringify(tasks.filter((t) => t !== "Call Mum")));
    ok("...the #r= is gone from the address, and no Safari card here", !(await y.p.evaluate(() => location.hash)) && !(await y.p.$("#moveCard")));
    await y.c.close(); }

  // The copied link pasted the next morning: the morning has come, so Begin (not "See you tomorrow")
  { const y = await open({ when: MON }); await y.goto(local(move));
    ok("Safari, pasted the next morning: the morning screen with Begin", (await h1(y)) === "A minute before the scroll." && (await y.p.textContent("#begin")) === "Begin my morning");
    await y.c.close(); }

  // The alarm Shortcut opens Safari (never used) the next morning
  { const y = await open({ when: MON }); await y.goto(local(alarm));
    ok("Safari from an old alarm link: first, 'Added Mornward to your home screen?'", /Added Mornward to your home screen\?/.test(await h1(y)));
    await click(y, "#safariHere");
    ok("Safari from the alarm, next morning: the morning screen with Begin, the plan there", (await h1(y)) === "A minute before the scroll." &&
      (await y.p.textContent("#begin")) === "Begin my morning" && (await y.p.$$("#prepList li")).length === 2 && (await y.ls("deviceId")) === id);
    await y.p.click("#begin"); await y.t(700); await y.p.click("#bskip"); await y.t(700);
    const ticked = await y.p.$$eval('.chip.pick[aria-pressed="true"]', (l) => l.map((e) => e.textContent.trim()));
    ok("...after breathing, the two tasks are ticked", JSON.stringify(ticked.sort()) === JSON.stringify(tasks.filter((t) => t !== "Call Mum").sort()), ticked);
    await y.p.click("#isave"); await y.t(700);
    // The Shortcut fires again the next day: nothing is overwritten
    await y.p.clock.setSystemTime(new Date("2026-10-06T07:05:00")); await y.goto(local(alarm));
    ok("the alarm link again the next day: nothing replaced (history kept, no setup again)", !(await y.p.$("#setupGo")) && !!(await y.ls("days")) &&
      (await y.ls("prepared")).used === true);
    await y.c.close(); }

  // Same browser that did the setup (normal Safari): the alarm link changes nothing
  { const y = await open(); await y.goto("?from=reddit"); await y.p.click("#installGuide .link[data-guide-close]").catch(() => {}); await y.t(300); await click(y, "#setupGo"); await click(y, "#stepNext"); await click(y, "#stepNext");
    const before = await y.ls("prepared"), myId = await y.ls("deviceId");
    await y.goto(local(alarm));
    ok("a browser that already has a setup ignores a carried link", (await y.ls("deviceId")) === myId && JSON.stringify(await y.ls("prepared")) === JSON.stringify(before));
    await y.c.close(); }

  // Tampered, old or foreign links
  const enc = (o) => "#r=" + encodeURIComponent(JSON.stringify(o));
  { const y = await open(); await y.goto("?carry=1" + enc({ v: 1, t: "beta-5", s: 0, e: 0, o: 1, b: 99, p: [0, 1] }));
    ok("another bank version: setup carried, no tasks (never the wrong ones)", (await y.ls("onboard")).status === "done" && !(await y.ls("prepared")));
    await y.c.close(); }
  { const y = await open(); await y.goto("?carry=1" + enc({ v: 1, t: "beta-5", s: 0, e: 0, o: 1, b: 1, p: [9999, -1, "x", 1.5, 2, 2, 3, 4, 5] }));
    const p = await y.ls("prepared");
    ok("bad positions dropped, duplicates removed, at most three", p && p.tasks.length === 3 && p.tasks.every((t) => typeof t === "string"), p);
    await y.c.close(); }
  { const y = await open(); await y.goto(enc({ v: 1, i: "11111111-1111-4111-8111-111111111111", t: "beta-5", s: 0, e: 0, o: 1 }));
    ok("a plain address with #r= (shared by a friend): ignored, Welcome", !!(await y.p.$("#setupGo")) && (await y.ls("deviceId")) !== "11111111-1111-4111-8111-111111111111");
    await y.c.close(); }

  // Counts off: no ID in the link; carried once
  { const y = await open(); await y.goto("?from=reddit"); await y.p.click("#installGuide .link[data-guide-close]").catch(() => {}); await y.t(300); await y.p.click("#preToggle"); await click(y, "#setupGo"); await click(y, "#stepNext");
    await click(y, "#stepNext"); await y.p.click("#moveCopy"); await y.t(200);
    const off = await clip(y);
    ok("counts off: the link holds no ID", !("i" in carried(off)) && carried(off).s === 1);
    await y.c.close();
    const z = await open(); await z.goto(local(off));
    ok("...carried: counts stay off, setup done, no ID made", (await z.ls("noStats")) === true && (await z.ls("onboard")).status === "done" && !(await z.ls("deviceId")));
    await z.c.close(); }

  // Where the card shows
  { const y = await open({ device: "Pixel 7" }); await y.goto("?from=reddit"); await y.p.click("#installGuide .link[data-guide-close]").catch(() => {}); await y.t(300); await click(y, "#setupGo"); await click(y, "#stepNext"); await click(y, "#stepNext");
    ok("Android from Reddit (Reddit uses Chrome's own storage there): no card", !(await y.p.$("#moveCard")));
    await y.c.close(); }
  { const y = await open(); await y.goto(); await click(y, "#setupGo"); await click(y, "#stepNext"); await click(y, "#stepNext");
    ok("iPhone Safari, no social link: no card", !(await y.p.$("#moveCard")));
    await y.c.close(); }
  { const y = await open({ device: "Pixel 7", init: () => Object.defineProperty(navigator, "userAgent", { get: () => navigator.appVersion + " Instagram 300.0" }) });
    await y.goto(); await click(y, "#setupGo"); await click(y, "#stepNext"); await click(y, "#stepNext");
    ok("Android inside Instagram's browser: 'Opened from Instagram?' with Copy link for Chrome", /Opened from Instagram\?/.test(await y.p.textContent("#moveCard")) &&
      (await y.p.textContent("#moveCopy")) === "Copy link for Chrome");
    await y.c.close(); }

  // The iPhone home-screen icon's start address carries the suggested tasks too (it opened on Ready with none)
  { const y = await open(); await y.goto(); await click(y, "#setupGo"); await click(y, "#stepNext"); await click(y, "#stepNext");
    const start = await y.p.evaluate(() => JSON.parse(decodeURIComponent(document.querySelector('link[rel="manifest"]').href.replace(/^data:application\/manifest\+json,/, ""))).start_url);
    const r2 = carried(start);
    ok("icon start address: setup done and the two bank positions", r2.o === 1 && r2.b === 1 && r2.p.length === 2, start);
    await y.c.close(); }

  await b.close(); await site.close();
  done();
})();
