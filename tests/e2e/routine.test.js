// Issues 1, 4 and 6: what counts as finished vs a full routine, interruption and reload at every stage, task saving.
// Run: node tests/e2e/routine.test.js   (see tests/README.md)
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter } = require("./helpers");
const { ok, done } = reporter("routine: completion, interruption, task saving");
const WHEN = "2026-10-05T07:10:00";
const TODAY = "2026-10-05";

// Wait until everything queued has been sent (real time; the page clock is fake)
async function drain(x) {
  for (let i = 0; i < 40; i++) {
    if (((await x.ls("outbox")) || []).length === 0) return;
    await x.t(100); await x.p.waitForTimeout(50);
  }
}
const of = (x, kind) => x.rows().filter((r) => r.kind === kind);
const summary = async (x) => (await x.p.textContent("#progCount")).trim();
const todaySlot = (x) => x.p.$eval(".progress li.now", (l) => l.className.replace(" now", ""));

(async () => {
  const site = await serve();
  const b = await chromium.launch();
  const open = (opt = {}) => ctx(b, site.url, { when: WHEN, ...opt });

  // ---------- Issue 1 ----------
  { const x = await open(); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.skipTasks(x); await drain(x);
    ok("1 skip both: the end is reached, and it says so plainly (no 'complete')", (await x.p.textContent("h1")) === "You're set for today." && /Breathing and mini tasks skipped/.test(await x.p.textContent("#finishSub")));
    const f = of(x, "routine_finished");
    ok("1 skip both: routine_finished sent once, core false", f.length === 1 && f[0].data.core === false && f[0].data.tasks === "skipped" && f[0].data.breathing === "skipped", f.map((r) => r.data));
    ok("1 skip both: no core_routine_completed", of(x, "core_routine_completed").length === 0);
    ok("1 skip both: breathing_skipped and tasks_skipped each sent once", of(x, "breathing_skipped").length === 1 && of(x, "tasks_skipped").length === 1);
    ok("1 skip both: the day is 'reached the end', not a full day", JSON.stringify(await x.ls("days")) === `["${TODAY}"]` && !(await x.ls("fullDays")));
    await S.finish(x);
    ok("1 skip both: no reset counted", (await summary(x)) === "No full morning resets yet", await summary(x));
    ok("1 skip both: today shows the small 'reached the end' mark, not a full circle", (await todaySlot(x)) === "part", await todaySlot(x));
    const label = await x.p.textContent(".progress .sr-only");
    ok("1 screen readers hear each day in words", /\(today\): reached the end, a step skipped/.test(label), label);
    ok("1 no percentage, ring or score anywhere", !(await x.p.$(".ring")) && !/%|of 7|this week/.test(await x.p.textContent(".progress")));
    // Adding tasks afterwards is an edit: it saves them but changes nothing the routine recorded
    const before = x.rows().length;
    await x.p.click("#iadd"); await x.t(700); await S.keep(x); await drain(x);
    ok("1 adding tasks after Finish saves them", (await x.p.$$("#itext li, p#itext")).length > 0);
    ok("1 ...but sends nothing (no tasks_saved, no core)", x.rows().length === before, x.kinds().slice(before));
    ok("1 ...and the day is still not a full routine", !(await x.ls("fullDays")) && (await summary(x)) === "No full morning resets yet");
    await x.c.close(); }

  { const x = await open(); await x.goto();
    await S.begin(x); await S.breatheAll(x);
    ok("1 breathing completed: on to the tasks", !!(await x.p.$("#isave")));
    await S.skipTasks(x); await drain(x);
    const f = of(x, "routine_finished")[0];
    ok("1 breathe + skip tasks: finished, core false", f && f.data.core === false && f.data.breathing === "completed" && f.data.tasks === "skipped" && of(x, "core_routine_completed").length === 0, f && f.data);
    // An edit from the Finish screen doesn't turn it into a full routine either
    await x.p.click("#iadd"); await x.t(700); await S.keep(x); await drain(x);
    ok("1 ...an edit on the Finish screen still sends no core", of(x, "core_routine_completed").length === 0 && of(x, "tasks_saved").length === 0, x.kinds());
    await x.c.close(); }

  { const x = await open(); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.keep(x); await drain(x);
    const f = of(x, "routine_finished")[0];
    ok("1 skip breathing + save tasks: finished, core false", f && f.data.core === false && f.data.tasks === "saved" && of(x, "core_routine_completed").length === 0, f && f.data);
    await x.c.close(); }

  { const x = await open(); await x.goto();
    await S.begin(x); await S.breatheAll(x); await S.keep(x); await drain(x);
    const f = of(x, "routine_finished")[0], c = of(x, "core_routine_completed");
    ok("1 three breaths + Save my tasks: finished with core true, and one core_routine_completed (def 2)", f && f.data.core === true && c.length === 1 && c[0].data.def === 2, x.kinds());
    ok("1 ...tasks_saved says the suggested pair was kept", of(x, "tasks_saved")[0].data.kept_defaults === true && of(x, "tasks_saved")[0].data.count === 2);
    ok("1 ...the day is a full routine", JSON.stringify(await x.ls("fullDays")) === `["${TODAY}"]`);
    ok("1 ...the first ever: 'Your first reset. Complete.', no extra line", (await x.p.textContent("h1")) === "Your first reset.Complete." && !(await x.p.$("#finishSub")));
    ok("1 ...the saved tasks are on the screen, with Edit, no checkboxes", (await x.p.$$("#itext li")).length === 2 && !!(await x.p.$("#iedit")) && !(await x.p.$(".intention input, .intention [role=checkbox]")));
    ok("1 ...'1 morning reset completed', today a full circle", (await summary(x)) === "1 morning reset completed" && (await todaySlot(x)) === "full", await summary(x));
    await S.finish(x);
    ok("1 ...Done goes to Today, same progress", !!(await x.p.$("#again")) && (await summary(x)) === "1 morning reset completed");
    // Run 2 the same day: its own task step is skipped, even though tasks were saved earlier
    await x.p.click("#again"); await x.t(700); await S.skipBreathing(x);
    ok("1 run 2: today's tasks come back ticked, waiting for a tap; one Save button", (await x.p.textContent("#pickHint")).includes("Today's tasks are ticked") && (await x.p.textContent("#isave")) === "Save my tasks");
    await S.skipTasks(x); await drain(x);
    const f2 = of(x, "routine_finished").find((r) => r.data.run === 2);
    ok("1 run 2 skip: recorded as skipped (not as the earlier save)", f2 && f2.data.tasks === "skipped" && of(x, "tasks_skipped")[0].data.had_earlier === true, f2 && f2.data);
    ok("1 run 2: the two runs have different rids", new Set(of(x, "routine_started").map((r) => r.data.rid)).size === 2);
    ok("1 run 2: still one day, still one full day", (await x.ls("days")).length === 1 && (await x.ls("fullDays")).length === 1);
    // Run 3, full again the same day: it says "Morning reset complete." (not "first"), and the count stays 1
    await S.finish(x); await x.p.click("#again"); await x.t(700); await S.breatheAll(x); await S.keep(x);
    ok("1 run 3 full, same day: 'Morning reset complete.', still 1 reset (one per date)", (await x.p.textContent("h1")) === "Morning reset complete." && (await summary(x)) === "1 morning reset completed");
    await x.c.close(); }

  { const x = await open(); await x.goto();
    await S.begin(x); await S.skipBreathing(x);
    await x.p.reload(); await x.t(700); await drain(x);
    ok("1 opening the task screen confirms nothing (no save, no event), even after a reload",
      !(await x.ls("intent:" + TODAY)) && !(await x.ls("picks:" + TODAY)) && of(x, "tasks_saved").length === 0);
    await x.c.close(); }

  // ---------- Issue 4 ----------
  { const x = await open(); await x.goto();
    await S.begin(x); await x.t(10500);
    ok("4 one breath done", (await x.ls("routine")).breaths === 1);
    await x.p.reload(); await x.t(700);
    ok("4 reload while breathing: comes back paused on breath 2", (await x.p.textContent("h1")) === "Paused" && (await x.p.textContent("#bpause")) === "Resume" && (await x.p.textContent("#bcount")) === "Breath 2 of 3");
    await x.t(60000);
    ok("4 ...and stays paused: no breath counted while waiting", (await x.ls("routine")).breaths === 1 && !!(await x.p.$("#bpause")));
    await x.p.click("#bpause"); await x.t(20500); await drain(x);
    ok("4 Resume finishes the last two breaths", !!(await x.p.$("#isave")) && of(x, "breathing_completed").length === 1);
    await x.c.close(); }

  { const x = await open(); await x.goto();
    await S.begin(x); await x.t(2000);
    const setHidden = (h, fire = true) => x.p.evaluate(([h, fire]) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
      if (fire) document.dispatchEvent(new Event("visibilitychange"));
    }, [h, fire]);
    await setHidden(true); await x.t(60000);
    ok("4 app in the background: breathing pauses, no breath completes", (await x.ls("routine")).breaths === 0 && (await x.p.textContent("h1")) === "Paused");
    await setHidden(false); await x.t(1000);
    ok("4 back in front: still paused until Resume is tapped", (await x.p.textContent("h1")) === "Paused");
    await x.p.click("#bpause"); await x.t(3000);
    // The hide event never arrives (some browsers): a breath still can't complete while hidden
    await setHidden(true, false); await x.t(30000);
    ok("4 hidden without a hide event: the breath doesn't count, breathing pauses", (await x.ls("routine")).breaths === 0 && (await x.p.textContent("h1")) === "Paused");
    await setHidden(false, false); await x.p.click("#bpause"); await x.t(31000);
    ok("4 ...and Resume starts that breath again", !!(await x.p.$("#isave")));
    await x.c.close(); }

  { const x = await open(); await x.goto();
    await S.begin(x); await S.skipBreathing(x); await S.untickAll(x);
    await x.p.click(".chip.pick >> nth=3"); await x.p.fill("#intent", "Walk the dog"); await x.t(200);
    const ticked = await x.p.$$eval('.chip.pick[aria-pressed="true"] span:not(.sr-only)', (l) => l.map((s) => s.textContent));
    await x.p.reload(); await x.t(700);
    ok("4 reload on the task screen: typed words and ticks come back", (await x.p.inputValue("#intent")) === "Walk the dog" &&
      JSON.stringify(await x.p.$$eval('.chip.pick[aria-pressed="true"] span:not(.sr-only)', (l) => l.map((s) => s.textContent))) === JSON.stringify(ticked));
    await S.keep(x); await drain(x);
    ok("4 skip breathing + save: 'Your mini tasks are saved.'", (await x.p.textContent("h1")) === "Your mini tasks are saved.");
    // Done tapped three times quickly
    await x.p.click("#finish"); await x.p.click("body", { position: { x: 200, y: 600 } }).catch(() => {}); await x.t(100);
    await x.p.click("body", { position: { x: 200, y: 600 } }).catch(() => {}); await x.t(700); await drain(x);
    ok("4 Done tapped repeatedly: on Today once, nothing new recorded", !!(await x.p.$("#again")) && of(x, "routine_finished").length === 1 && (await x.ls("days")).length === 1 && (await x.ls("routine")).phase === "done");
    const saved = await x.ls("intent:" + TODAY);
    await x.p.click("#iedit"); await x.t(700); await S.untickAll(x); await x.p.fill("#intent", "Something else"); await x.t(100);
    await x.p.click("#iskip"); await x.t(700);
    ok("4 edit, then 'Keep it as it was': tasks unchanged, the edit's draft dropped", (await x.ls("intent:" + TODAY)) === saved && !(await x.ls("draft:" + TODAY)) && !(await x.ls("picks:" + TODAY)));
    // Reopening the same day (a new tab) shows Today, not Begin or onboarding
    const p2 = await x.c.newPage(); await p2.clock.install({ time: new Date("2026-10-05T12:00:00") }); await p2.goto(site.url); await p2.clock.runFor(700);
    ok("4 same-day reopen: Today with the saved tasks", !!(await p2.$("#again")) && !(await p2.$("#begin")) && (await p2.textContent("h1")) === "Done for today." && (await p2.$$("#itext li")).length === 2);
    await p2.close();
    // Reloading before Done: Today, not the celebration again, and nothing sent twice
    { const y = await open(); await y.goto(); await S.begin(y); await S.breatheAll(y); await S.keep(y); await drain(y);
      await y.p.reload(); await y.t(700); await drain(y);
      ok("4 reload on the completion screen: opens Today (no replayed celebration), nothing sent twice", !!(await y.p.$("#again")) && !(await y.p.$(".sunrise.rise")) &&
        of(y, "routine_finished").length === 1 && of(y, "core_routine_completed").length === 1);
      await y.c.close(); }
    await x.c.close(); }

  // ---------- Issue 6 ----------
  { const x = await open({ init: () => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (window.__failTasks && String(k).startsWith("fl.intent:")) throw new DOMException("full", "QuotaExceededError"); return set.call(this, k, v); };
    } });
    await x.goto(); await S.begin(x); await S.skipBreathing(x);
    const msg = () => x.p.textContent("#imsg");
    await S.untickAll(x); await S.keep(x);
    ok("6 zero tasks: refused with a message, nothing saved", /Pick one, or skip for today/.test(await msg()) && !(await x.ls("intent:" + TODAY)) && !!(await x.p.$("#isave")));
    await x.p.fill("#intent", "   \n\t  "); await S.keep(x);
    ok("6 only spaces: refused the same way", /Pick one, or skip for today/.test(await msg()) && !(await x.ls("intent:" + TODAY)));
    // typing folds the chips away; they come back a moment after the field loses focus
    await x.p.fill("#intent", ""); await x.p.click("h1"); await x.t(600);
    for (const i of [0, 1, 2]) await x.p.click(`.chip.pick >> nth=${i}`);
    await x.p.click(".chip.pick >> nth=3"); await x.t(100);
    ok("6 a fourth suggestion can't be ticked", /Up to 3/.test(await msg()) && (await x.p.$$('.chip.pick[aria-pressed="true"]')).length === 3);
    await x.p.fill("#intent", "Walk"); await S.keep(x);
    ok("6 three suggestions + your own: refused, nothing saved", /Up to 3/.test(await msg()) && !(await x.ls("intent:" + TODAY)));
    await x.p.fill("#intent", ""); await x.p.click("h1"); await x.t(600);
    await x.p.click(".chip.pick >> nth=0"); await x.p.click(".chip.pick >> nth=1");
    const kept = (await x.p.textContent('.chip.pick[aria-pressed="true"] span')).trim();
    await x.p.fill("#intent", "  " + kept.toUpperCase() + "  ");
    // Storage fails: no success shown, the draft stays, nothing sent
    await x.p.evaluate(() => { window.__failTasks = true; }); await S.keep(x);
    ok("6 saving fails: says so, offers Retry, stays on the screen, words still there", /Couldn't save on this phone/.test(await msg()) && (await x.p.textContent("#isave")) === "Retry" &&
      (await x.p.inputValue("#intent")).includes(kept.toUpperCase()) && (await x.ls("routine")).phase === "choose" && !(await x.ls("fullDays")) && !(await x.ls("days")));
    await drain(x);
    ok("6 ...and nothing is recorded as saved", x.rows().every((r) => r.kind !== "tasks_saved" && r.kind !== "routine_finished"));
    await x.p.evaluate(() => { window.__failTasks = false; }); await S.keep(x); await drain(x);
    ok("6 repeat in different capitals is saved once, in the first wording", (await x.ls("intent:" + TODAY)) === kept, await x.ls("intent:" + TODAY));
    ok("6 ...and tasks_saved counts 1", of(x, "tasks_saved").length === 1 && of(x, "tasks_saved")[0].data.count === 1);
    // Edit: the separator inside your own words, a long task, an emoji at the limit
    await x.p.click("#iedit"); await x.t(700); await S.untickAll(x);
    await x.p.fill("#intent", "Walk · run · swim"); await S.keep(x);
    ok("6 a typed ' · ' stays one task (it used to split into three and pass the limit)", (await x.ls("intent:" + TODAY)) === "Walk, run, swim", await x.ls("intent:" + TODAY));
    await x.p.click("#iedit"); await x.t(700); await S.untickAll(x);
    await x.p.fill("#intent", "Col·laborar amb l'equip"); await S.keep(x);
    ok("6 a '·' inside a word is kept as typed", (await x.ls("intent:" + TODAY)) === "Col·laborar amb l'equip", await x.ls("intent:" + TODAY));
    await x.p.click("#iedit"); await x.t(700); await S.untickAll(x);
    const long = "a".repeat(199) + "😀" + "b".repeat(60);
    await x.p.evaluate((v) => { const f = document.querySelector("#intent"); f.value = v; f.dispatchEvent(new Event("input")); }, long); await S.keep(x);
    const t = await x.ls("intent:" + TODAY);
    ok("6 a long task is cut at 200 characters, without splitting the emoji", Array.from(t).length === 200 && t.endsWith("😀") && !/[\uD800-\uDBFF]$/.test(t), Array.from(t).length);
    ok("6 edits send nothing", of(x, "tasks_saved").length === 1);
    await x.c.close(); }

  await b.close(); await site.close();
  done();
})();
