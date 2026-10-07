// Ways back for the next morning: the iPhone alarm Shortcut on step 2, "leave this page open" on Ready (only in the
// phone's own browser), and ticking mini tasks off once they're done (numbers counted, never which).
// Run: node tests/e2e/return.test.js
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter } = require("./helpers");
const { ok, done } = reporter("return: alarm Shortcut, leave it open, tick tasks off");
const EVE = "2026-10-04T20:30:00", MON = "2026-10-05T07:05:00";
const click = async (x, sel) => { await x.p.click(sel); await x.t(700); };
async function drain(x) { for (let i = 0; i < 40 && ((await x.ls("outbox")) || []).length; i++) { await x.t(100); await x.p.waitForTimeout(50); } }

(async () => {
  const site = await serve();
  const b = await chromium.launch();
  const open = (o = {}) => ctx(b, site.url, { when: EVE, device: "iPhone 14", ...o });

  // Item 2 (reversed): no alarm Shortcut. On iPhone it can only open Safari, which shares nothing with the home-screen
  // app; the calendar alert says to open Mornward from the home screen instead.
  { const x = await open(); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    ok("iPhone step 2: no alarm Shortcut anywhere (not on the page, not under More options)", !(await x.p.$("#remShortcut")) && !(await x.p.$("#remCopy")) &&
      !/alarm stops|Shortcuts/i.test(await x.p.textContent("#card")));
    ok("...Add to Apple Calendar is there", await x.p.isVisible("#remIcs"));
    await x.c.close(); }
  { const x = await open({ device: "Pixel 7" }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    ok("Android step 2: Google Calendar first", await x.p.isVisible("#remGoogle"));
    await x.c.close(); }

  // The Safari safety net (iPhone): Safari shares nothing with the home-screen app
  const SAFARI_HOME = () => localStorage.setItem("fl.homeAdded", JSON.stringify({ how: "self", on: "2026-10-04" }));
  { const x = await open({ init: SAFARI_HOME }); await x.goto(); await click(x, "#setupGo");
    ok("during setup in Safari (icon already added): setup goes on, no interruption", !!(await x.p.$("#prepIntent")) || !!(await x.p.$("#stepNext")));
    await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("...finishing setup: Ready as usual (the screen comes on the next open)", (await x.p.innerText("h1")).includes("Ready for your"));
    await x.p.reload(); await x.t(700);
    ok("Safari, set up and icon added, opened again: 'Mornward lives on your home screen.' 'Open it from there to keep your progress.'",
      (await x.p.innerText("h1")).replace(/\s+/g, " ").trim() === "Mornward lives on your home screen." &&
      (await x.p.textContent(".lede")).trim() === "Open it from there to keep your progress." && !!(await x.p.$(".hoicon")));
    await click(x, "#safariHere");
    ok("...'Continue here instead': the usual screen", (await x.p.innerText("h1")).includes("Ready for your"));
    await x.p.reload(); await x.t(700);
    ok("...and it doesn't ask again during this visit", (await x.p.innerText("h1")).includes("Ready for your"));
    await x.c.close(); }
  { const x = await open({ when: "2026-10-05T07:05:00" }); await x.goto("?via=calendar");
    ok("Safari opened from an old calendar link, never seen Mornward: 'Added Mornward to your home screen?'",
      (await x.p.innerText("h1")).replace(/\s+/g, " ").trim() === "Added Mornward to your home screen?");
    await click(x, "#safariHere");
    ok("...Continue here: Welcome", !!(await x.p.$("#setupGo")));
    await x.c.close(); }
  { const x = await open({ when: "2026-10-05T07:05:00" }); await x.goto();
    ok("Safari, a first visit (no link, no icon): Welcome as usual", !!(await x.p.$("#setupGo")));
    await x.c.close(); }
  { const x = await open({ when: "2026-10-05T07:05:00", device: "Pixel 7", init: SAFARI_HOME }); await x.goto("?via=calendar");
    ok("Android: never (links can open the installed app there)", !(await x.p.$("#safariHere")));
    await x.c.close(); }
  { const x = await open({ when: "2026-10-05T07:05:00", init: () => { localStorage.setItem("fl.homeAdded", JSON.stringify({ how: "self", on: "2026-10-04" }));
      Object.defineProperty(navigator, "standalone", { get: () => true }); } });
    await x.goto("?via=calendar");
    ok("the home-screen app itself: never", !(await x.p.$("#safariHere")));
    await x.c.close(); }

  // Item 3: "leave this page open", only where it's true
  { const x = await open(); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("Safari, Ready: no tip before the tap (kept to the word budget)", !(await x.p.$("#leaveOpen")));
    await x.p.click("#seeYou"); await x.t(200);
    ok("...See you tomorrow: 'All set. Tomorrow, open Mornward from your home screen.'",
      (await x.p.textContent("#seeYouMsg")).trim() === "All set. Tomorrow, open Mornward from your home screen.");
    await x.c.close(); }
  { const x = await open(); await x.goto("?from=reddit"); await S.inBrowser(x); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("Reddit's browser: the Safari card shows", !!(await x.p.$("#moveCard")));
    await x.p.click("#seeYou"); await x.t(200);
    ok("...See you tomorrow points to the card: 'Copy your link above so Safari has it tomorrow.'", (await x.p.textContent("#seeYouMsg")).trim() === "All set. Copy your link above so Safari has it tomorrow.");
    await x.c.close(); }
  { const x = await open({ device: "Desktop Chrome" }); await x.p.setViewportSize({ width: 1280, height: 800 }); await x.goto();
    await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    await x.p.click("#seeYou"); await x.t(200);
    ok("computer: no 'lock your phone' (it says you can close it)", (await x.p.textContent("#seeYouMsg")).trim() === "All set. You can close Mornward now.");
    await x.c.close(); }
  { const x = await open({ when: MON }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    await x.p.clock.setSystemTime(new Date("2026-10-06T07:05:00")); await x.p.reload(); await x.t(700);
    ok("the next morning: Begin my morning, no See you tomorrow", !(await x.p.$("#seeYou")) && (await x.p.textContent("#begin")) === "Begin my morning");
    await x.c.close(); }

  // Item 4: tick tasks off on Finish and Today
  { const x = await open({ when: MON, device: "Pixel 7" }); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.keep(x);
    const rows = await x.p.$$("[data-task]");
    ok("Finish: each mini task is a row to tick, none ticked; 'Go do your first task, then come back and tick it.'",
      rows.length === 2 && (await x.p.$$('[data-task][aria-pressed="true"]')).length === 0 &&
      (await x.p.textContent("#tickHint")) === "Go do your first task, then come back and tick it.");
    await x.p.click('[data-task="0"]'); await x.t(200);
    const name0 = (await x.p.textContent('[data-task="0"] .tt')).trim();
    ok("...tick one: ticked, '1 of 2 done. Go do the next one.' (spoken), kept on the phone by name for today", (await x.p.getAttribute('[data-task="0"]', "aria-pressed")) === "true" &&
      (await x.p.textContent("#tickHint")) === "1 of 2 done. Go do the next one." && (await x.p.getAttribute("#tickHint", "aria-live")) === "polite" &&
      JSON.stringify(await x.ls("doneTasks:2026-10-05")) === JSON.stringify([name0]) && !(await x.p.$("#finish")));
    await x.p.click('[data-task="0"]'); await x.t(200);
    ok("...tap again: unticked", (await x.p.getAttribute('[data-task="0"]', "aria-pressed")) === "false" && JSON.stringify(await x.ls("doneTasks:2026-10-05")) === "[]");
    ok("...the hint is back to the first step", (await x.p.textContent("#tickHint")) === "Go do your first task, then come back and tick it.");
    await x.p.click('[data-task="0"]'); await x.t(200);
    await S.finish(x);
    ok("Today: the tick is still there, with the same status line", (await x.p.getAttribute('[data-task="0"]', "aria-pressed")) === "true" &&
      (await x.p.textContent("#tickHint")) === "1 of 2 done. Go do the next one.");
    ok("...today's circle: no check yet (not every task ticked)", !(await x.p.$(".progress li.now.ticked")));
    await x.p.click('[data-task="1"]'); await x.t(200);
    ok("Today, all ticked: a check and 'All done. Lock your phone and enjoy your morning.'; today's circle gets a check",
      (await x.p.textContent("#tickHint")).trim() === "All done. Lock your phone and enjoy your morning." && !!(await x.p.$("#tickHint .i")) &&
      !!(await x.p.$(".progress li.now.ticked .dot .i")) && /mini tasks ticked off/.test(await x.p.textContent(".progress .sr-only")));
    await x.p.reload(); await x.t(700);
    ok("...after a reload: both ticked, the check stays", (await x.p.$$('[data-task][aria-pressed="true"]')).length === 2 && !!(await x.p.$(".progress li.now.ticked")));
    await drain(x);
    // A row can go out twice while a send is in flight (same event_id; the database stores it once): count each once
    const seen = new Set();
    const ticks = x.rows().filter((r) => r.kind === "tasks_ticked" && !seen.has(r.event_id) && seen.add(r.event_id)).map((r) => r.data.ticked + "/" + r.data.total);
    ok("counted: one row per new high (1/2, then 2/2); untick and re-tick sent nothing new", JSON.stringify(ticks) === '["1/2","2/2"]', ticks);
    ok("counted: numbers only, never which task", x.rows().filter((r) => r.kind === "tasks_ticked").every((r) =>
      Object.keys(r.data).every((k) => ["run", "rid", "home_screen", "test", "ticked", "total"].includes(k))) && !x.bodies.some((bd) => bd.includes(name0)));
    // Editing the tasks: a tick never moves onto another task
    await x.p.click("#iedit"); await x.t(700);
    await x.p.click('.chip.pick[aria-pressed="true"]'); await x.t(200); // untick the first chosen task
    await x.p.click("#isave"); await x.t(700);
    const left = await x.p.$$eval("[data-task]", (l) => l.map((e) => [e.querySelector(".tt").textContent.trim(), e.getAttribute("aria-pressed")]));
    ok("after an edit: ticks stay with their task (by name)", left.length === 1 && left[0][1] === "true", left);
    await x.c.close(); }
  // Finish, all ticked right there: no extra Done to reach a near-identical screen; reopening shows Today
  { const x = await open({ when: MON, device: "Pixel 7" }); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.keep(x);
    await x.p.click('[data-task="0"]'); await x.t(200); await x.p.click('[data-task="1"]'); await x.t(200);
    ok("Finish, all ticked: the stop line, and no Done button", (await x.p.textContent("#tickHint")).trim() === "All done. Lock your phone and enjoy your morning." &&
      !(await x.p.$("#finish")) && (await x.ls("routine")).phase === "done");
    await x.p.reload(); await x.t(700);
    ok("...reopened: Today (Done for today), not Finish again", (await x.p.innerText("h1")).trim() === "Done for today.");
    await x.c.close(); }
  { const x = await open({ when: MON, device: "Pixel 7" }); await x.goto();
    await x.p.click("#preToggle"); await S.begin(x); await S.skipBreathing(x); await S.keep(x);
    await x.p.click('[data-task="0"]'); await x.t(300); await drain(x);
    ok("counts off: ticking works, nothing sent", (await x.p.getAttribute('[data-task="0"]', "aria-pressed")) === "true" && x.bodies.length === 0);
    await x.c.close(); }
  { const x = await open({ when: MON, device: "Pixel 7" }); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    await x.p.clock.setSystemTime(new Date("2026-10-06T07:05:00")); await x.p.reload(); await x.t(700);
    await S.begin(x); await S.skipBreathing(x); await S.keep(x);
    ok("a new day starts with nothing ticked", (await x.p.$$('[data-task][aria-pressed="true"]')).length === 0);
    await x.c.close(); }

  await b.close(); await site.close();
  done();
})();
