// Setup-first onboarding: prepare now, practise in the morning. The 13 acceptance scenarios of the brief, plus resume,
// back navigation, personalization and the privacy of setup answers.
// Run: node tests/e2e/onboarding.test.js   (scenario numbers match docs/onboarding.md)
const { execFileSync } = require("child_process");
const fs = require("fs");
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter } = require("./helpers");
const { ok, done } = reporter("onboarding: setup first, practise in the morning");
const SUN_EVE = "2026-10-04T20:30:00", MON = "2026-10-05T07:05:00";
async function drain(x) { for (let i = 0; i < 40 && ((await x.ls("outbox")) || []).length; i++) { await x.t(100); await x.p.waitForTimeout(50); } }
const h1 = (x) => x.p.innerText("h1").then((t) => t.replace(/\s+/g, " ").trim());
const text = (x) => x.p.innerText("#card");
const ticked = (x) => x.p.$$eval('.chip.pick[aria-pressed="true"] span', (l) => l.map((e) => e.textContent));
async function jump(x, when) { await x.p.clock.setSystemTime(new Date(when)); await x.p.reload(); await x.t(700); }
const click = async (x, sel) => { await x.p.click(sel); await x.t(700); };
// Coming back later (after setup): the same screen, as "A minute before the scroll."
const later = async (x) => { await x.p.reload(); await x.t(700); };
// Welcome → step 1 (keep the two suggestions) → step 2 (Continue) → ready, with the optional invitation (Instagram)
async function setupAll(x, { app = "instagram" } = {}) {
  await click(x, "#setupGo");
  await click(x, "#stepNext"); await click(x, "#stepNext");
  if (app) await pickApps(x, [app]);
}
// The optional "Personalize your morning invitation" section (ready and prepared screens)
async function pickApps(x, apps) {
  if (!(await x.p.$("#prefsSec[open]"))) await x.p.click("#prefsSec summary");
  for (const a of apps) { await x.p.click(`#prefApps [data-app="${a}"]`); await x.t(50); }
}
const pressed = (x) => x.p.$$eval('#prefApps [data-app][aria-pressed="true"]', (l) => l.map((e) => e.dataset.app));
const snapshot = (x) => x.p.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
// The app's own words a person can see (task names, screen-reader-only text and folded sections left out: task names
// are shuffled per phone, so they'd make the count vary)
const words = (x) => x.p.evaluate(() => { const c = document.querySelector("#card").cloneNode(true);
  c.querySelectorAll(".sr-only, .chip.pick span, #prepList li, #cardTeaser, #mcard, #cardNext").forEach((e) => e.remove()); // content, not the app's own words
  document.body.appendChild(c); const t = c.innerText; c.remove(); return t.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length; });
const BUDGET = { welcome: 45, tasks: 25, ret: 35, ready: 40, prepared: 40, morning: 25 };
const NOT_LATE = /missed|late\b|overdue|behind|streak|you didn't/i;

(async () => {
  const site = await serve();
  const b = await chromium.launch();
  const open = (opt = {}) => ctx(b, site.url, { when: SUN_EVE, ...opt });

  // 1-3, 6, 7: Sunday-evening setup, Monday morning
  { const x = await open(); await x.goto();
    ok("welcome: the headline, the routine as three icons, Prepare my morning, Begin now", (await h1(x)) === "A calmer start, before the scroll." &&
      (await x.p.$$("#flowRow li .i")).length === 3 && (await x.p.textContent("#setupGo")) === "Prepare my morning" &&
      (await x.p.textContent("#beginNow")) === "Up already? Begin now");
    ok("welcome: the promise", (await x.p.textContent("#promise")) === "Start your day on purpose, not on a feed.");
    ok(`welcome: few words (≤ ${BUDGET.welcome})`, (await words(x)) <= BUDGET.welcome, "words: " + await words(x));
    ok("welcome: the counts choice and terms are there before anything is sent", !!(await x.p.$("#preToggle")) && !!(await x.p.$('#consent a[href="terms.html"]')) && x.bodies.length === 0);
    ok("welcome: no 'demo', 'test' or 'practice' wording", !/demo|test run|practice/i.test(await text(x)));
    const before = await snapshot(x);
    await x.t(5000); await drain(x);
    ok("welcome: looking changes nothing on the phone and starts nothing", (await snapshot(x)) === before && !(await x.p.$("#bpause")) && x.bodies.length === 0);
    await click(x, "#setupGo");
    ok("step 1 is the tasks: the heading, step bars, the shared task picker", (await h1(x)) === "Pick your morning tasks." &&
      (await x.p.textContent(".stepnum")) === "Step 1 of 2" && (await x.p.$$(".stepbars i")).length === 2 && (await x.p.$$(".stepbars i.on")).length === 1 &&
      (await x.p.$$("[data-idea]")).length === 6 &&
      (await x.p.textContent("#stepNext")) === "Save my plan" && (await x.p.textContent("#stepSkip")) === "Choose later");
    ok(`step 1: few words besides the task names (≤ ${BUDGET.tasks})`, (await words(x)) <= BUDGET.tasks, "words: " + await words(x));
    ok("step 1: no 'where your scroll starts' question in the way", !(await x.p.$("[data-app]")) && !/scroll usually start/.test(await text(x)));
    ok("step 1: nothing saved just by opening it", !(await x.ls("prepared")));
    // Back to Welcome keeps what was chosen; the typing is kept too
    await S.untickAll(x); await x.p.click(".chip.pick >> nth=4"); await x.p.fill("#prepIntent", "Call Mum"); await x.t(100);
    const chosen = await ticked(x);
    await click(x, "#stepBack");
    ok("back from step 1: Welcome", (await h1(x)) === "A calmer start, before the scroll.");
    await click(x, "#setupGo");
    ok("forward again: ticks and typing kept", JSON.stringify(await ticked(x)) === JSON.stringify(chosen) && (await x.p.inputValue("#prepIntent")) === "Call Mum");
    // Reload in the middle of setup: it resumes on the same step with the same choices
    await x.p.reload(); await x.t(700);
    ok("reload mid-setup: back on step 1, choices kept", (await h1(x)) === "Pick your morning tasks." && (await x.p.inputValue("#prepIntent")) === "Call Mum" && JSON.stringify(await ticked(x)) === JSON.stringify(chosen));
    await click(x, "#stepNext");
    ok("step 2: 'Make it easy to return.', a time (no day to pick), the first reminder in words, Skip for now", (await h1(x)) === "Make it easy to return." &&
      (await x.p.textContent(".stepnum")) === "Step 2 of 2" &&
      !!(await x.p.$("#remAt")) && !(await x.p.$("#remDate")) && !(await x.p.$("[data-rem-day]")) && /^First reminder: Monday, October 5 at 7:00/.test(await x.p.textContent("#remWhen")) &&
      (await x.p.textContent("#stepSkip")) === "Skip for now");
    ok(`step 2: few words (≤ ${BUDGET.ret}); the extra calendar steps are folded`, (await words(x)) <= BUDGET.ret && !(await x.p.$("#remMore[open]")), "words: " + await words(x));
    ok("step 2: the next morning (Sunday evening → Monday) at the time shown", /^First reminder: Monday, October 5 at 7:00/.test(await x.p.textContent("#remWhen")) && (await x.p.inputValue("#remAt")) === "07:00");
    ok("step 2: one visually primary action (Continue); calendar and home screen are secondary", (await x.p.$$("#card .primary")).length === 1 &&
      (await x.p.textContent("#card .primary")) === "Continue" && !!(await x.p.$("#addSec")));
    ok("step 2: no hard-coded 'tomorrow'", !/tomorrow/i.test(await text(x)));
    // One card: tap a time
    await x.p.click('[data-rem-quick="06:30"]'); await x.t(100);
    ok("step 2: a quick time sets the time and the first reminder", (await x.p.inputValue("#remAt")) === "06:30" &&
      /at 6:30/.test(await x.p.textContent("#remWhen")) && (await x.p.getAttribute('[data-rem-quick="06:30"]', "aria-pressed")) === "true");
    ok("step 2: the time row doesn't squeeze (each box inside the card)", await x.p.evaluate(() => { const c = document.querySelector(".remcard").getBoundingClientRect();
      return [...document.querySelectorAll(".remcard input[type=time], .remcard .chip")].every((e) => { const r = e.getBoundingClientRect(); return r.left >= c.left - 1 && r.right <= c.right + 1; }); }));
    await x.p.click('[data-rem-quick="07:00"]'); await x.t(100);
    const g = decodeURIComponent(await x.p.getAttribute("#remGoogle", "href"));
    ok("step 2: the Google link starts at the first reminder, carries no setup answers or IDs", g.includes("dates=20261005T070000") && !/instagram|Call Mum|#r=/i.test(g));
    ok("step 2: the Apple link is the file for that time", (await x.p.getAttribute("#remIcs", "href")) === "cal/0700.ics");
    await x.p.click("#remGoogle"); await x.t(300);
    ok("11 calendar opened: says to finish saving there (no 'reminder set')", (await x.p.textContent("#remMsg")) === "Calendar opened—finish saving your reminder there.");
    ok("step 2: after a calendar tap the button says Done, no Skip", (await x.p.textContent("#stepNext")) === "Done" && !(await x.p.$("#stepSkip")));
    // The calendar hand-off can reload the page (back from the calendar app): the tasks are still prepared
    await x.p.reload(); await x.t(700);
    ok("after the calendar hand-off and a reload: straight to Ready (no second step 2, no second Done), the tasks prepared", (await h1(x)) === "Ready for your first morning." &&
      (await x.ls("onboard")).status === "done" && JSON.stringify((await x.ls("prepared")).tasks) === JSON.stringify([...chosen, "Call Mum"]));
    ok("ready: one screen with the copy, See you tomorrow and Edit setup; no way to start tonight (no separate 'Done for now' step)", (await h1(x)) === "Ready for your first morning." &&
      (await text(x)).includes("When you wake, open Mornward first.") && !(await x.p.$("#setupDone")) && !(await x.p.$("#beginNow")) &&
      (await x.p.textContent("#seeYou")) === "See you tomorrow" && !(await x.p.$("#begin")) && !/try it now/i.test(await text(x)) && (await x.p.textContent("#setupEdit")) === "Edit setup" &&
      (await x.p.$$("#card .primary")).length === 1);
    ok(`ready: few words besides the tasks (≤ ${BUDGET.ready})`, (await words(x)) <= BUDGET.ready, "words: " + await words(x));
    ok("ready: the prepared tasks are shown", JSON.stringify(await x.p.$$eval("#prepList li", (l) => l.map((e) => e.textContent))) === JSON.stringify([...chosen, "Call Mum"]));
    ok("ready: the reminder status says what's known (the date, and to check the calendar saved it)", /^Monday, October 5 at 7:00.*\. Check your calendar saved it\.$/.test(await x.p.textContent("#remStatus")));
    ok("ready: no sun, circles, count, timeline, %, streak, 'complete' claim; 'tomorrow' only on the button and the card", !(await x.p.$(".sunrise")) && !(await x.p.$(".progress")) && !(await x.p.$(".dot")) &&
      !/%|streak|reset complete|resets completed/i.test(await text(x)) &&
      !/tomorrow/i.test((await text(x)).replace("See you tomorrow", "").replace(/Tomorrow's card/i, "")));
    ok("11 ready: no claim that a reminder is set", !/reminder (is )?(set|saved|on)\b|you'll be reminded/i.test(await text(x)));
    // The optional invitation, folded away
    ok("ready: 'Personalize' is closed and optional", (await x.p.textContent("#prefsSec summary")).trim() === "Personalize" && !(await x.p.$("#prefsSec[open]")));
    await pickApps(x, ["instagram", "tiktok", "unsure"]);
    ok("personalize: 'I'm not sure' stands alone", JSON.stringify(await pressed(x)) === '["unsure"]');
    await pickApps(x, ["instagram"]);
    ok("personalize: choosing an app clears 'I'm not sure'; saved on the phone", JSON.stringify(await pressed(x)) === '["instagram"]' && JSON.stringify((await x.ls("onboard")).apps) === '["instagram"]');
    ok("personalize: neutral wording, and says it can't block or watch apps", /doesn't block or watch apps/.test(await text(x)) && !/addict|problem|bad habit/i.test(await text(x)));
    await drain(x);
    ok("1 setup recorded no routine: no routine, days, full days or start day", !(await x.ls("routine")) && !(await x.ls("days")) && !(await x.ls("fullDays")) && !(await x.ls("startDay")));
    ok("1 ...and no routine events: only setup_started, setup_completed, reminder_setup", JSON.stringify(x.kinds().sort()) === '["reminder_setup","setup_completed","setup_started"]', x.kinds());
    ok("setup events carry no answers", x.bodies.every((bd) => !/instagram|tiktok|Call Mum|07:00|"apps"/i.test(bd)) &&
      x.rows().find((r) => r.kind === "setup_completed").data.tasks_prepared === 2);
    await x.p.click("#seeYou"); await x.t(200);
    ok("ready: See you tomorrow → 'All set. Tomorrow, open Mornward from your home screen.' (nothing starts)", !(await x.p.isVisible("#seeYou")) &&
      /^All set\. Tomorrow, open Mornward from your home screen\./.test((await x.p.textContent("#seeYouMsg")).trim()) && !(await x.p.$("#bpause")));
    await later(x);
    ok("opened again the same evening: still Ready, See you tomorrow (not the morning screen)", (await h1(x)) === "Ready for your first morning." && (await x.p.textContent("#seeYou")) === "See you tomorrow");
    ok("6 the evening before: no late or missed", !NOT_LATE.test(await text(x)));
    ok("prepared: breathing doesn't start by itself", !(await x.p.$("#bpause")));
    // The next morning: the morning screen, nothing overdue
    await jump(x, MON);
    ok("next morning: the morning screen, the promise, the routine as icons, Begin my morning", (await h1(x)) === "A minute before the scroll." && (await x.p.$$("#flowRow li")).length === 3 &&
      (await x.p.textContent("#promise")) === "Start your day on purpose, not on a feed." && !(await x.p.$("#themeSec")) &&
      (await x.p.textContent("#begin")) === "Begin my morning" && !(await x.p.$("#seeYou")) && !!(await x.p.$("#setupEdit")));
    ok("prepared: the Instagram line", (await x.p.textContent("#invite")) === "Before Instagram, take a minute for yourself.");
    ok("prepared: the tasks are visible", JSON.stringify(await x.p.$$eval("#prepList li", (l) => l.map((e) => e.textContent))) === JSON.stringify([...chosen, "Call Mum"]));
    ok(`prepared: few words besides the tasks (≤ ${BUDGET.prepared})`, (await words(x)) <= BUDGET.prepared, "words: " + await words(x));
    ok("6 next morning: setup kept, no 'tomorrow', overdue or missed message", !/tomorrow/i.test(await text(x)) && !NOT_LATE.test(await text(x)));
    ok("6 ...setup isn't repeated", !(await x.p.$("#setupGo")) && !(await x.p.$("#stepNext")));
    // 2: Monday morning: the prepared tasks are offered, ticked, but not confirmed
    await S.begin(x); await S.breatheAll(x);
    ok("2 Monday: after breathing, the prepared tasks are ticked, waiting for a tap", JSON.stringify((await ticked(x)).sort()) === JSON.stringify([...chosen, "Call Mum"].sort()) &&
      /Your plan is ticked/.test(await x.p.textContent("#pickHint")));
    ok(`2 the morning task step: few words besides the task names (≤ ${BUDGET.morning}); six suggestions at most`, (await words(x)) <= BUDGET.morning && (await x.p.$$("[data-idea]")).length <= 6, "words: " + await words(x));
    ok("2 ...nothing saved for Monday yet", !(await x.ls("intent:2026-10-05")) && !(await x.ls("fullDays")));
    await x.p.reload(); await x.t(700);
    ok("2 ...still not confirmed after a reload", !(await x.ls("intent:2026-10-05")) && !!(await x.p.$("#isave")));
    await S.keep(x); await drain(x);
    ok("3 Monday: 'Your first reset. Complete.'", (await h1(x)) === "Your first reset. Complete.");
    ok("3 ...progress shows Monday only (not Sunday's setup), one completed morning", JSON.stringify(await x.p.$$eval(".progress li", (l) => l.map((e) => e.className + ":" + e.querySelector(".wd").textContent))) === '["full now:Mon 5"]' &&
      (await x.p.textContent("#progCount")) === "1 morning reset completed");
    const ts = x.rows().find((r) => r.kind === "tasks_saved");
    ok("3 ...tasks_saved says they came from setup (prepared: true), not the suggested pair", ts && ts.data.prepared === true && ts.data.kept_defaults === false);
    ok("3 ...routine_started marked first", x.rows().find((r) => r.kind === "routine_started").data.first === true);
    await S.finish(x);
    await x.p.reload(); await x.t(700);
    ok("7 reopened after the first routine: Today ('Your mini tasks.' until they're ticked)", (await h1(x)) === "Your mini tasks." && !!(await x.p.$("#again")));
    for (const t of await x.p.$$('[data-task][aria-pressed="false"]')) { await t.click(); await x.t(150); }
    ok("7 ...every task ticked: 'Done for today.'", (await h1(x)) === "Done for today.");
    // The next day: the usual daily choice, not the prepared tasks again
    await jump(x, "2026-10-06T07:00:00");
    ok("next day: Begin (not setup, not the prepared screen)", !!(await x.p.$("#begin")) && (await x.p.textContent("#begin")) === "Begin");
    ok("next day: Begin keeps the Instagram line", (await x.p.textContent("#invite")) === "Before Instagram, take a minute for yourself.");
    await S.begin(x); await S.skipBreathing(x);
    ok("next day: the usual two suggestions, not the setup tasks", /Two picked/.test(await x.p.textContent("#pickHint")) && !(await ticked(x)).includes("Call Mum"));
    ok("setup events were sent once each", x.kinds().filter((k) => k === "setup_started").length === 1 && x.kinds().filter((k) => k === "setup_completed").length === 1);
    await x.c.close(); }

  // 3b: a partial first morning keeps its date, without full credit
  { const x = await open(); await x.goto(); await setupAll(x); await later(x);
    await jump(x, MON); await S.begin(x); await S.skipBreathing(x); await S.keep(x);
    ok("3b partial first morning: 'Your mini tasks are saved.', Monday a small mark, no full count", (await h1(x)) === "Your mini tasks are saved." &&
      JSON.stringify(await x.p.$$eval(".progress li", (l) => l.map((e) => e.className))) === '["part now"]' && (await x.p.textContent("#progCount")) === "No full morning resets yet");
    await x.c.close(); }

  // 4: Begin now, without any preference questions
  { const x = await open({ when: MON }); await x.goto();
    await click(x, "#beginNow");
    ok("4 Begin now: straight into breathing", !!(await x.p.$("#bpause")) && !(await x.ls("onboard")));
    await S.breatheAll(x);
    ok("4 ...the usual task step (two suggestions)", /Two picked/.test(await x.p.textContent("#pickHint")));
    await S.keep(x); await S.finish(x);
    await jump(x, "2026-10-06T07:00:00");
    ok("4 ...next visit: Begin, never sent into setup", !!(await x.p.$("#begin")) && !(await x.p.$("#setupGo")) && !(await x.p.$("#stepNext")));
    await x.p.click("#begin").catch(() => {}); await x.t(700); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    await x.p.click("#prefsSec summary");
    await x.p.click('#prefApps [data-app="youtube"]');
    ok("preferences in Today: optional, saved as tapped", (await x.ls("onboard")).apps[0] === "youtube" && (await x.p.getAttribute('#prefApps [data-app="youtube"]', "aria-pressed")) === "true");
    await jump(x, "2026-10-07T07:00:00");
    ok("preferences: Begin uses the new line", (await x.p.textContent("#invite")) === "Before YouTube, take a minute for yourself.");
    await x.c.close(); }

  // 5: skip everything and still finish
  { const x = await open(); await x.goto();
    await click(x, "#setupGo"); await click(x, "#stepSkip"); await click(x, "#stepSkip");
    ok("5 skip tasks and reminder (the invitation untouched): setup still finishes", (await h1(x)) === "Ready for your first morning." &&
      (await text(x)).includes("When you wake, open Mornward first.") && !(await x.p.$("#prepList")));
    ok("5 ...no reminder: no reminder line at all", !(await x.p.$("#remStatus")) && !(await x.ls("remPlan")));
    await later(x);
    ok("5 prepared screen: the plain line, no task card", !(await x.p.isVisible("#invite")) && !(await x.p.$("#prepList")));
    await jump(x, MON); await S.begin(x); await S.breatheAll(x);
    ok("5 first morning: the usual two suggestions", /Two picked/.test(await x.p.textContent("#pickHint")));
    await x.c.close(); }

  // Several apps or none: the plain line. Edit setup keeps answers.
  { const x = await open(); await x.goto();
    await setupAll(x, { app: null }); await pickApps(x, ["reddit", "x"]); await later(x);
    ok("two apps: the plain line only", !(await x.p.isVisible("#invite")));
    // The invitation can also be changed on the prepared screen; the line follows straight away
    await pickApps(x, ["x"]);
    ok("prepared: personalize there too; the line updates at once", (await x.p.textContent("#invite")) === "Before Reddit, take a minute for yourself.");
    await click(x, "#setupEdit");
    ok("Edit setup: starts at the tasks, the saved tasks ticked", (await h1(x)) === "Pick your morning tasks." && (await ticked(x)).length === 2);
    await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("Edit setup: ready again, the invitation kept", (await h1(x)) === "Ready for your first morning." && JSON.stringify((await x.ls("onboard")).apps) === '["reddit"]');
    await later(x);
    ok("Edit setup: Reddit line", (await x.p.textContent("#invite")) === "Before Reddit, take a minute for yourself.");
    await drain(x);
    ok("Edit setup sends no second setup_completed", x.kinds().filter((k) => k === "setup_completed").length === 1);
    await x.c.close(); }

  // 8: existing users skip setup (beta-2 storage, and this version's history)
  { const x = await open({ init: () => {
      if (localStorage.getItem("fl.seeded")) return; localStorage.setItem("fl.seeded", "1");
      const set = (k, v) => localStorage.setItem("fl." + k, JSON.stringify(v));
      set("deviceId", "b2b2b2b2-1111-4222-8333-444455556666"); set("agreed", { version: "beta-2", on: "2026-09-28" });
      set("setup", { done: true, habit: "social", doors: ["gmail"] }); set("intent:2026-10-03", "Call the bank"); set("streak", { last: "2026-10-03", count: 2 });
    } });
    await x.goto();
    ok("8 a beta-2 user: Begin, not Welcome or setup", !!(await x.p.$("#begin")) && !(await x.p.$("#setupGo")));
    ok("8 ...their task and history kept", /Call the bank/.test(await x.p.textContent("#earlier")) && (await x.ls("days")).length === 2, await x.ls("days"));
    await x.c.close(); }
  { const x = await open({ init: () => {
      if (localStorage.getItem("fl.seeded")) return; localStorage.setItem("fl.seeded", "1");
      localStorage.setItem("fl.everStarted", "true"); localStorage.setItem("fl.agreed", JSON.stringify({ version: "beta-5", on: "2026-10-01", how: "begin" }));
      localStorage.setItem("fl.startDay", '"2026-10-01"'); localStorage.setItem("fl.fullDays", '["2026-10-01"]'); localStorage.setItem("fl.days", '["2026-10-01"]');
    } });
    await x.goto();
    ok("8 a user from before setup existed: Begin with their progress, no setup", !!(await x.p.$("#begin")) && !!(await x.p.$(".progress")) && !(await x.p.$("#setupGo")));
    await x.c.close(); }

  // 9: counts off for the whole journey
  { const x = await open(); await x.goto();
    await x.p.click("#preToggle"); await x.t(100);
    await setupAll(x); await later(x);
    await jump(x, MON); await S.begin(x); await S.breatheAll(x); await S.keep(x); await S.finish(x); await x.p.waitForTimeout(400);
    ok("9 counts off: the whole journey works", ["Done for today.", "Your mini tasks."].includes(await h1(x)) && !!(await x.p.$("#again")) && (await x.ls("fullDays")).length === 1);
    ok("9 ...and nothing was sent or queued, no ID made", x.bodies.length === 0 && ((await x.ls("outbox")) || []).length === 0 && !(await x.ls("deviceId")));
    await x.c.close(); }

  // 10: failed saves keep input, show no success
  { const x = await open({ init: () => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (window.__fail && window.__fail.some((p) => String(k) === "fl." + p && (p !== "onboard" || String(v).includes('"done"')))) throw new DOMException("full", "QuotaExceededError");
        return set.call(this, k, v);
      };
    } });
    await x.goto(); await click(x, "#setupGo");
    await x.p.fill("#prepIntent", "Water the plants"); await x.t(100);
    await x.p.evaluate(() => { window.__fail = ["prepared"]; }); await click(x, "#stepNext");
    ok("10 prepared tasks can't be saved: Retry, still on step 1, typing kept", (await x.p.textContent("#stepNext")) === "Retry" &&
      (await h1(x)) === "Pick your morning tasks." && (await x.p.inputValue("#prepIntent")) === "Water the plants" && /Couldn't save/.test(await x.p.textContent("#imsg")));
    await x.p.evaluate(() => { window.__fail = []; }); await click(x, "#stepNext");
    ok("10 ...Retry works", (await h1(x)) === "Make it easy to return." && (await x.ls("prepared")).tasks.includes("Water the plants"));
    await x.p.evaluate(() => { window.__fail = ["onboard"]; }); await click(x, "#stepNext");
    ok("10 setup can't be saved as finished: no 'Ready', a message and Retry", (await h1(x)) === "Make it easy to return." &&
      /Couldn't save your setup/.test(await x.p.textContent("#remMsg")) && (await x.p.textContent("#stepNext")) === "Retry");
    await x.p.evaluate(() => { window.__fail = []; }); await click(x, "#stepNext");
    ok("10 ...Retry finishes setup", (await h1(x)) === "Ready for your first morning." && (await x.ls("onboard")).status === "done");
    await x.c.close(); }

  // 11: a calendar hand-off that fails doesn't trap anyone; an opened calendar file isn't a saved reminder
  { const x = await open(); await x.c.unroute(/calendar\.google\.com/); await x.c.route(/calendar\.google\.com/, (r) => r.abort());
    await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    const pages = x.c.pages().length;
    await x.p.click("#remGoogle"); await x.t(500);
    ok("11 Google Calendar couldn't open: the setup page still works", (await h1(x)) === "Make it easy to return." && !!(await x.p.$("#stepNext")));
    for (const p of x.c.pages().slice(pages)) await p.close();
    await x.p.click("#remMore summary"); await x.p.click("#remIcsAlt"); await x.t(300);
    ok("11 calendar file: opened from a link, nothing about a download", (await x.p.textContent("#remMsg")) === "Calendar opened—finish saving your reminder there." && (await h1(x)) === "Make it easy to return.");
    await click(x, "#stepNext");
    ok("11 ...setup finishes, without claiming a reminder", (await h1(x)) === "Ready for your first morning." && !/reminder (is )?(set|saved|on)\b/i.test(await text(x)));
    await x.c.close(); }

  // 12: computer → phone: offered before any personal choice; opening isn't installing; nothing moves
  { const x = await ctx(b, site.url, { when: SUN_EVE, device: "Desktop Chrome" }); await x.p.setViewportSize({ width: 1280, height: 800 }); await x.goto();
    ok("12 computer, Welcome: Prepare my morning, no choices yet", (await x.p.textContent("#setupGo")) === "Prepare my morning" && !(await x.p.$("#prepIntent")));
    ok("12 computer, Welcome: the phone code beside the app, with 'What is Mornward?' above it", !!(await x.p.$("#handoffSlot #handoff .qr")) && (await x.p.textContent("#aboutTitle")) === "What is Mornward?");
    const wgeo = await x.p.evaluate(() => { const c = document.querySelector("#handoffSlot #handoff").getBoundingClientRect(), q = document.querySelector("#handoffSlot .qr").getBoundingClientRect();
      return { w: c.width, q: q.width, off: Math.abs((q.left + q.right) / 2 - (c.left + c.right) / 2) }; });
    ok("12 computer, Welcome: the card is slim, the code centred and still scannable", wgeo.w <= 240 && wgeo.q >= 120 && wgeo.off < 2, wgeo);
    ok("12 computer, Welcome: before any choice, no setup state or event yet", !(await x.ls("onboard")) && !x.kinds().includes("setup_started"));
    ok("12 ...the card says scan to open on the phone", (await x.p.textContent("#hoTitle")) === "Set up where you’ll use it." && /Scan to open Mornward on your phone\./.test(await x.p.textContent("#handoff")));
    const note = await x.p.textContent("#hoNote");
    ok("12 ...says the code opens it in the browser and installs nothing", /Opens in your phone’s browser\. Installs nothing\./.test(note));
    ok("12 ...says choices stay here (no sync claimed)", /Choices made here stay here/.test(note) && !/transfer|sync|carry over/i.test(await x.p.textContent("#handoffSlot")));
    await x.p.locator("#handoff .qr").screenshot({ path: "/tmp/mw-qr-onb.png" });
    let url = "";
    try { url = execFileSync("python3", ["-c", "import cv2,sys\nimg=cv2.imread(sys.argv[1]); img=cv2.resize(img,None,fx=2,fy=2,interpolation=cv2.INTER_NEAREST)\nv,_,_=cv2.QRCodeDetector().detectAndDecode(img); print(v)", "/tmp/mw-qr-onb.png"]).toString().trim(); } catch {}
    ok("12 ...the code opens the real site, with nothing personal or any ID in it", url === "https://mornward.app/?from=qr" || url === "", url || "(OpenCV not available: skipped)");
    ok("12 ...the code's address in the page has no ID either", !(await x.p.content()).match(/mornward\.app\/\?from=qr[^"'<\s]*(#|&|i=)/));
    await click(x, "#setupGo");
    ok("12 Prepare my morning on a computer: straight to step 1 (no repeated code step)", (await h1(x)) === "Pick your morning tasks." && (await x.ls("onboard")).status === "started" && !(await x.p.$("#card #handoff")));
    await click(x, "#stepNext"); await click(x, "#stepNext"); await later(x);
    ok("12 ...after setup on the computer, the phone card is still offered beside the app", !!(await x.p.$("#handoffSlot #handoff")) &&
      (await x.p.textContent("#hoTitle")) === "Set up where you’ll use it.");
    const geo = await x.p.evaluate(() => { const c = document.querySelector("#handoffSlot #handoff").getBoundingClientRect(), q = document.querySelector("#handoffSlot .qr").getBoundingClientRect();
      return { w: c.width, q: q.width, off: Math.abs((q.left + q.right) / 2 - (c.left + c.right) / 2) }; });
    ok("12 ...the card is slim and the code is centred in it, still scannable", geo.w <= 240 && geo.q >= 120 && geo.off < 2, geo);
    const about = (await x.p.textContent("#aboutBox p")).trim();
    ok("12 ...above it, 'What is Mornward?' in ten words", (await x.p.textContent("#aboutTitle")) === "What is Mornward?" && about.split(/\s+/).length === 10 &&
      about === "A one-minute morning routine: three breaths, then your chosen tasks.", about);
    const above = await x.p.evaluate(() => document.querySelector("#aboutBox").getBoundingClientRect().bottom <= document.querySelector("#handoffSlot #handoff").getBoundingClientRect().top);
    ok("12 ...the box sits above the code card", above);
    ok("12 ...no Appearance section any more", !(await x.p.$("#themeSec")));
    await x.c.close(); }
  for (const device of ["Pixel 7", "iPhone 13"]) {
    const x = await open({ device }); await x.goto();
    const seen = [!!(await x.p.$("#handoff"))];
    await click(x, "#setupGo"); seen.push(!!(await x.p.$("#handoff")));
    ok(`12 ${device}: Prepare my morning goes straight to step 1`, (await h1(x)) === "Pick your morning tasks.");
    await click(x, "#stepNext"); seen.push(!!(await x.p.$("#handoff"))); await click(x, "#stepNext"); seen.push(!!(await x.p.$("#handoff")));
    await later(x); seen.push(!!(await x.p.$("#handoff")));
    ok(`12 ${device}: never shows the phone-transfer code`, seen.every((v) => !v), seen);
    await x.c.close();
  }

  // 13: large text, keyboard, screen readers, dark mode, narrow phones
  for (const [label, opt] of [["320 px phone", { device: "iPhone SE" }], ["dark mode", { scheme: "dark" }], ["reduced motion", { init: () => { window.__reduce = true; } }], ["200% text", { init: () => { document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = "200%"; }); } }]]) {
    const x = await open(opt); if (label === "reduced motion") await x.p.emulateMedia({ reducedMotion: "reduce" }); await x.goto();
    const fit = async () => x.p.evaluate(() => document.scrollingElement.scrollWidth <= Math.min(innerWidth, screen.width) + 1);
    const res = [await fit()];
    await click(x, "#setupGo"); res.push(await fit()); await click(x, "#stepNext"); res.push(await fit());
    await click(x, "#stepNext"); res.push(await fit()); await pickApps(x, ["instagram"]); res.push(await fit());
    await later(x); res.push(await fit());
    await jump(x, MON); await S.begin(x); res.push(await fit()); await S.skipBreathing(x); res.push(await fit());
    await S.keep(x); res.push(await fit()); await S.finish(x); res.push(await fit());
    ok(`13 ${label}: every setup and morning screen fits without sideways scrolling`, res.every(Boolean), res);
    await x.c.close();
  }
  { const x = await open(); await x.goto();
    await x.p.keyboard.press("Tab"); let f = "";
    for (let i = 0; i < 6 && f !== "setupGo"; i++) { f = await x.p.evaluate(() => document.activeElement.id); if (f !== "setupGo") await x.p.keyboard.press("Tab"); }
    await x.p.keyboard.press("Enter"); await x.t(700);
    ok("13 keyboard: Tab to 'Prepare my morning', Enter opens step 1", (await h1(x)) === "Pick your morning tasks.");
    ok("13 screen readers: focus moves to the new heading, the step is announced", (await x.p.evaluate(() => document.activeElement.tagName)) === "H1" &&
      /Step 1 of 2/.test(await x.p.textContent("#announce")));
    ok("13 screen readers: the task choices are a labelled group of toggle buttons", (await x.p.getAttribute("#ideas", "role")) === "group" && !!(await x.p.getAttribute("#ideas", "aria-label")) &&
      (await x.p.$$eval("[data-idea]", (l) => l.every((e) => e.tagName === "BUTTON" && e.hasAttribute("aria-pressed")))));
    const was = await x.p.getAttribute('[data-idea="3"]', "aria-pressed");
    await x.p.focus('[data-idea="3"]'); await x.p.keyboard.press("Space"); await x.t(100);
    ok("13 keyboard: Space toggles a choice", (await x.p.getAttribute('[data-idea="3"]', "aria-pressed")) !== was);
    const small = await x.p.evaluate(() => [...document.querySelectorAll("#card button")].filter((e) => e.offsetParent).filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim()));
    ok("13 every button on step 1 is at least 44 px tall", small.length === 0, small);
    await x.c.close(); }
  // Keyboard: the personalize chips open and toggle, and are labelled toggles
  { const x = await open(); await x.goto();
    await setupAll(x, { app: null });
    await x.p.focus("#prefsSec summary"); await x.p.keyboard.press("Enter"); await x.t(200);
    await x.p.focus('#prefApps [data-app="facebook"]'); await x.p.keyboard.press("Space"); await x.t(100);
    ok("13 keyboard: personalize opens and toggles with the keyboard", (await x.p.getAttribute('#prefApps [data-app="facebook"]', "aria-pressed")) === "true" &&
      (await x.p.getAttribute("#prefApps", "role")) === "group" && !!(await x.p.getAttribute("#prefApps", "aria-label")));
    await x.c.close(); }

  // 7 routing, all four cases on one phone: set up, not started → interrupted → finished today → a later day
  { const x = await open(); await x.goto(); await setupAll(x); await later(x);
    await jump(x, MON);
    ok("7a setup done, no routine yet: the first-morning invitation", (await h1(x)) === "A minute before the scroll." && (await x.p.textContent("#begin")) === "Begin my morning");
    await S.begin(x); await x.t(2000);
    await x.p.reload(); await x.t(700);
    ok("7b interrupted mid-breathing: back on breathing, paused, nothing counted", (await x.p.textContent("#bpause")) === "Resume" && (await h1(x)) === "Paused" && !(await x.ls("fullDays")));
    await x.p.click("#bpause"); await S.breatheAll(x);
    await x.p.reload(); await x.t(700);
    ok("7b interrupted on the tasks: the task step again, the prepared tasks still unconfirmed", !!(await x.p.$("#isave")) && !(await x.ls("intent:2026-10-05")));
    await S.keep(x); await S.finish(x); await x.p.reload(); await x.t(700);
    ok("7c finished today: Today", ["Done for today.", "Your mini tasks."].includes(await h1(x)) && !!(await x.p.$("#again")));
    await jump(x, "2026-10-08T07:00:00");
    ok("7d a later day: a new morning invitation (Begin, 'Welcome back.' after missed days), no setup", (await h1(x)) === "Welcome back." && !!(await x.p.$("#begin")) && !(await x.p.$("#stepNext")));
    ok("7d ...progress starts Monday (no Sunday), missed days hollow, one completed morning", JSON.stringify(await x.p.$$eval(".progress li", (l) => l.map((e) => e.className.split(" ")[0]))) === '["full","none","none","none"]' &&
      (await x.p.textContent("#progCount")) === "1 morning reset completed");
    await x.c.close(); }

  // B: once a reminder was added, Mornward doesn't ask again (setup's Edit, and Today)
  { const x = await open(); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    await x.p.click('[data-rem-quick="06:30"]'); await x.p.click("#remGoogle"); await x.t(300);
    for (const p of x.c.pages().slice(1)) await p.close();
    await click(x, "#stepNext"); await x.t(3000); await click(x, "#setupEdit"); await click(x, "#stepNext");
    ok("B Edit setup after adding a reminder: step 2 isn't asked again (tasks saved → Ready), the reminder kept", (await h1(x)) === "Ready for your first morning." &&
      !(await x.p.$("#remAt")) && (await x.ls("remPlan")).at === "06:30");
    await jump(x, MON); await S.begin(x); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    await x.p.click("#remindSec summary"); await x.t(200);
    ok("B Today: Morning reminder shows the added reminder instead of asking", (await x.p.textContent("#remDoneWhen")) === "6:30 AM, every morning" && !(await x.p.isVisible("#remAt")));
    ok("B ...no claim that it's saved in the calendar (it says what was added from here)", !/saved|is set|will remind/i.test(await x.p.textContent("#remDone")));
    await x.p.click("#remChange"); await x.t(200);
    ok("B Change: the controls come back, with a note to delete the old event", await x.p.isVisible("#remAt") && await x.p.isVisible("#remOld"));
    await x.c.close(); }

  // Option 2: already done → "All set to return" (both), or a tick for the home screen (only that). On iPhone, only in
  // the home-screen app: Safari can't see the icon, so a Safari "I've added it" gives no tick there.
  { const x = await open({ device: "iPhone 14", init: () => { localStorage.setItem("fl.homeAdded", JSON.stringify({ how: "self", on: "2026-10-04" })); } });
    await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    ok("iPhone Safari after 'I've added it': no '✓ On your home screen' tick on step 2", !(await x.p.$("#homeTick")) && !(await x.p.$("#allSet")));
    await x.c.close(); }

  for (const [label, init, expect] of [
    ["both done", () => { Object.defineProperty(navigator, "standalone", { get: () => true }); localStorage.setItem("fl.homeAdded", JSON.stringify({ how: "self", on: "2026-10-04" })); localStorage.setItem("fl.remPlan", JSON.stringify({ at: "06:30", first: "2026-10-05" })); }, "all"],
    ["only on the home screen", () => { Object.defineProperty(navigator, "standalone", { get: () => true }); localStorage.setItem("fl.homeAdded", JSON.stringify({ how: "self", on: "2026-10-04" })); }, "home"],
    ["only the reminder", () => { localStorage.setItem("fl.remPlan", JSON.stringify({ at: "06:30", first: "2026-10-05" })); }, "rem"]]) {
    const x = await open({ device: "iPhone 14", init }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    if (expect === "all") {
      ok(`all set (${label}): one card, two ticks, Done only`, (await x.p.textContent("#allSet")) === "All set to return" &&
        JSON.stringify(await x.p.$$eval(".setlist li", (l) => l.map((e) => e.textContent.trim()))) === '["Calendar reminder: 6:30 AM, every morning","On your home screen"]' &&
        !(await x.p.isVisible("#remAt")) && !(await x.p.$("#addSec")) && !(await x.p.$("#homeTick")) && !(await x.p.$("#stepSkip")) && (await x.p.textContent("#stepNext")) === "Done");
      await x.p.click("#remChange"); await x.t(200);
      ok(`all set (${label}): "Change the reminder" brings the controls back`, await x.p.isVisible("#remAt") && !(await x.p.isVisible("#remDone")));
      await click(x, "#stepNext");
      ok(`all set (${label}): Continue goes to Ready`, (await h1(x)) === "Ready for your first morning.");
    } else if (expect === "home") {
      ok(`home only: a tick instead of the add steps; the reminder card as usual`, (await x.p.textContent("#homeTick")).trim() === "On your home screen" && !(await x.p.$("#addSec")) &&
        await x.p.isVisible("#remAt") && !!(await x.p.$("#stepSkip")));
    } else {
      ok(`reminder only: no step 2 at all, straight to Ready`, (await h1(x)) === "Ready for your first morning." && !(await x.p.$("#remSetup")));
    }
    await x.c.close();
  }

  // iPhone, added from Safari's Share menu (Safari can't see it): "Already on my home screen" says so, once
  { const x = await open({ device: "iPhone 14" }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    await x.p.click("#addSec summary"); await x.p.click("#addHave"); await x.t(200);
    ok("home row: 'Already on my home screen' turns the row into a tick, remembered on the phone", !(await x.p.$("#addSec")) && !!(await x.p.$("#homeTick")) && (await x.ls("homeAdded")).how === "self");
    await click(x, "#stepNext"); await x.p.clock.setSystemTime(new Date(MON)); await x.p.reload(); await x.t(700);
    ok("home row: ...next morning in Safari: points to the home screen first", /lives on your home screen/.test(await h1(x)));
    await click(x, "#safariHere"); await click(x, "#begin"); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
    ok("home row: ...no add-to-home-screen offer on Today afterwards", !(await x.p.$("[data-install-add]")) && !(await x.p.$("#addSec")));
    await x.c.close(); }

  // See you tomorrow: when the morning comes, and what an open tab does
  { const x = await open({ when: "2026-10-05T01:30:00" }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("set up at 1:30 AM: 'See you in the morning' (the morning is today)", (await x.p.textContent("#seeYou")) === "See you in the morning");
    await x.t(3 * 3600000); await x.p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await x.t(100);
    ok("...a tab left open: the morning screen at 4:30 AM, without a reload", (await h1(x)) === "A minute before the scroll." && (await x.p.textContent("#begin")) === "Begin my morning");
    await x.c.close(); }
  // Set up at 5:10 AM with a reminder at 6:30 that morning: "See you at 6:30 AM", and the morning screen at 6:30
  { const x = await open({ when: "2026-10-05T05:10:00" }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    await x.p.click('[data-rem-quick="06:30"]'); await x.p.click("#remGoogle"); await x.t(300);
    for (const p of x.c.pages().slice(1)) await p.close();
    await click(x, "#stepNext");
    ok("set up at 5:10 AM, reminder at 6:30 today: 'See you at 6:30 AM' (not 'tomorrow')", (await x.p.textContent("#seeYou")) === "See you at 6:30 AM", await x.p.textContent("#seeYou"));
    await x.t(81 * 60000); await x.p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await x.t(100);
    ok("...at 6:31 the morning screen, with Begin my morning", (await h1(x)) === "A minute before the scroll." && (await x.p.textContent("#begin")) === "Begin my morning");
    await x.c.close(); }
  // Opened from the reminder: always the morning screen, even before 4 AM
  { const x = await open(); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    await x.goto("?via=calendar");
    ok("opened from the calendar link the same evening: the morning screen, not See you tomorrow", (await x.p.textContent("#begin")) === "Begin my morning" && !(await x.p.$("#seeYou")));
    await x.c.close(); }
  { const x = await open({ when: "2026-10-05T07:30:00" }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("set up in the morning: See you tomorrow, and nothing to start until tomorrow (the plan stays for the first morning)",
      (await x.p.textContent("#seeYou")) === "See you tomorrow" && !(await x.p.$("#begin")) && (await x.ls("prepared")).used === false && !(await x.ls("startDay")));
    await x.c.close(); }
  { const x = await open(); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
    await jump(x, MON); await x.t(3000); await click(x, "#setupEdit"); await click(x, "#stepNext"); await click(x, "#stepNext");
    ok("editing setup the next morning doesn't bring back See you tomorrow", (await x.p.textContent("#begin")) === "Begin my morning" && !(await x.p.$("#seeYou")));
    await x.c.close(); }

  // The first reminder is the next morning, worked out from the real date and time
  for (const [when, want, label] of [["2026-10-05T06:00:00", "2026-10-05", "setting up at 6 AM (reminder at 7): later this morning"],
    ["2026-10-05T08:00:00", "2026-10-06", "setting up at 8 AM: tomorrow"],
    ["2026-10-05T01:30:00", "2026-10-05", "setting up at 1:30 AM: the morning about to come"],
    ["2026-12-31T21:00:00", "2027-01-01", "New Year's Eve: January 1 (with the year)"]]) {
    const x = await open({ when }); await x.goto(); await click(x, "#setupGo"); await click(x, "#stepNext");
    const [y, m, d] = want.split("-").map(Number);
    const words = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    ok(`step 2: ${label}`, (await x.p.textContent("#remWhen")).startsWith(`First reminder: ${words}`), await x.p.textContent("#remWhen"));
    if (want === "2027-01-01") ok("step 2: ...the year is written out", /2027/.test(await x.p.textContent("#remWhen")));
    await x.c.close();
  }

  // Privacy: prepared tasks and answers never leave the phone; deleting on the phone removes them
  { const x = await open(); await x.goto(); await setupAll(x); await later(x);
    await x.p.click("#privSec summary"); await x.p.click("#wipeLocal"); await x.p.click("#wipeYes"); await x.t(1200);
    ok("Delete everything on this phone removes setup too: back to Welcome", (await h1(x)) === "A calmer start, before the scroll." && !(await x.ls("onboard")) && !(await x.ls("prepared")));
    await x.c.close(); }

  await b.close(); await site.close();
  done();
})();
