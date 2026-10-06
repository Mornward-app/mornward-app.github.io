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

  // Item 2: on iPhone the Shortcut sits right under Apple Calendar, not under More options
  { const x = await open(); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    ok("iPhone step 2: 'Open Mornward when my alarm stops' under Apple Calendar, outside More options",
      await x.p.isVisible("#remShortcut summary") && !(await x.p.$("#remMore #remShortcut")) &&
      (await x.p.textContent("#remShortcut summary")).trim() === "Open Mornward when my alarm stops");
    await x.p.click("#remShortcut summary"); await x.t(200);
    ok("...tapping it opens the four steps and the copy button in place", await x.p.isVisible("#remShortcut .vsteps") && await x.p.isVisible("#remCopy"));
    ok("...the steps don't split words (each step is one row, inside the box)", await x.p.evaluate(() => {
      const box = document.querySelector("#remShortcut").getBoundingClientRect();
      return [...document.querySelectorAll("#remShortcut .vsteps li")].every((li) => { const r = li.getBoundingClientRect(); return r.width > box.width * 0.7 && r.right <= box.right + 1; }); }));
    await x.p.click("#remCopy"); await x.t(200);
    ok("...copying the link: Done, no Skip (a way back is set up)", (await x.p.textContent("#stepNext")) === "Done" && !(await x.p.$("#stepSkip")));
    ok("...the copied link carries the setup after # (opens Safari, which may not have it)", /^https:\/\/mornward\.app\/\?via=alarm#r=/.test(await x.p.evaluate(() => navigator.clipboard.readText())));
    await x.p.reload(); await x.t(700);
    ok("...after a reload: still Done (kept on the phone)", (await x.p.textContent("#stepNext")) === "Done");
    await x.c.close(); }
  { const x = await open({ device: "Pixel 7" }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    ok("Android step 2: no Shortcut (it's iPhone only); Google Calendar first", !(await x.p.isVisible("#remShortcut summary")) && await x.p.isVisible("#remGoogle"));
    await x.c.close(); }
  { const x = await open(); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    await x.p.click("#remShortcut summary"); await x.p.click("#remCopy"); await x.t(200);
    await x.p.click("#stepBack"); await x.t(700); await click(x, "#stepNext");
    ok("Done stays after Back and forward", (await x.p.textContent("#stepNext")) === "Done");
    await x.c.close(); }

  // Item 3: "leave this page open", only where it's true
  { const x = await open(); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("Safari, Ready: 'Tip: leave this page open tonight.'", (await x.p.textContent("#leaveOpen")) === "Tip: leave this page open tonight.");
    await x.p.click("#seeYou"); await x.t(200);
    ok("...See you tomorrow: 'All set. Lock your phone with this page open.' (the tip isn't repeated)",
      (await x.p.textContent("#seeYouMsg")).trim() === "All set. Lock your phone with this page open. It'll be here when you unlock." && !(await x.p.isVisible("#leaveOpen")));
    await x.c.close(); }
  { const x = await open(); await x.goto("?from=reddit"); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("Reddit's browser (the Safari card shows): no 'leave this page open'", !!(await x.p.$("#moveCard")) && !(await x.p.$("#leaveOpen")));
    await x.p.click("#seeYou"); await x.t(200);
    ok("...See you tomorrow points to the card: 'Copy your link above so Safari has it tomorrow.'", (await x.p.textContent("#seeYouMsg")).trim() === "All set. Copy your link above so Safari has it tomorrow.");
    await x.c.close(); }
  { const x = await open({ device: "Desktop Chrome" }); await x.p.setViewportSize({ width: 1280, height: 800 }); await x.goto();
    await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("computer: no 'leave this page open'", !(await x.p.$("#leaveOpen")));
    await x.c.close(); }
  { const x = await open({ when: MON }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    await x.p.clock.setSystemTime(new Date("2026-10-06T07:05:00")); await x.p.reload(); await x.t(700);
    ok("the next morning (Begin my morning): no tip", !(await x.p.$("#leaveOpen")) && (await x.p.textContent("#begin")) === "Begin my morning");
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
    ok("...tick one: ticked, the hint goes, kept on the phone by name for today", (await x.p.getAttribute('[data-task="0"]', "aria-pressed")) === "true" &&
      !(await x.p.isVisible("#tickHint")) && JSON.stringify(await x.ls("doneTasks:2026-10-05")) === JSON.stringify([name0]));
    await x.p.click('[data-task="0"]'); await x.t(200);
    ok("...tap again: unticked", (await x.p.getAttribute('[data-task="0"]', "aria-pressed")) === "false" && JSON.stringify(await x.ls("doneTasks:2026-10-05")) === "[]");
    await x.p.click('[data-task="0"]'); await x.t(200);
    await S.finish(x);
    ok("Today: the tick is still there", (await x.p.getAttribute('[data-task="0"]', "aria-pressed")) === "true");
    await x.p.click('[data-task="1"]'); await x.t(200);
    await x.p.reload(); await x.t(700);
    ok("...after a reload: both ticked", (await x.p.$$('[data-task][aria-pressed="true"]')).length === 2);
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
