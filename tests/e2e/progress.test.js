// "Your progress" and the completion screen: real dates from the first routine, full / partial / none circles,
// dotted connectors edge to edge, the cumulative count, the rolling window, older data never counted as full.
// Run: node tests/e2e/progress.test.js
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter } = require("./helpers");
const { ok, done } = reporter("progress: timeline, count, completion screen");

const slots = (x) => x.p.$$eval(".progress li", (l) => l.map((li) => ({ label: li.querySelector(".wd").textContent, today: li.querySelector(".tl").textContent,
  state: ["full", "part", "none"].find((c) => li.classList.contains(c)) })));
const labels = async (x) => (await slots(x)).map((s) => s.label).join(", ");
const fulls = async (x) => (await slots(x)).filter((s) => s.state === "full").map((s) => s.label).join(", ");
const count = (x) => x.p.textContent("#progCount");
async function jump(x, when) { await x.p.clock.setSystemTime(new Date(when)); await x.p.reload(); await x.t(700); }
async function full(x) { await S.begin(x); await S.breatheAll(x); await S.keep(x); }

(async () => {
  const site = await serve();
  const b = await chromium.launch();

  // The example: starts Sunday 4 Oct, back Monday, misses Tuesday, back Wednesday
  { const x = await ctx(b, site.url, { when: "2026-10-04T07:10:00" }); await x.goto();
    ok("before any routine: no progress section on Begin", !(await x.p.$(".progress")));
    await full(x);
    ok("Sun: 'Your first reset. Complete.' + 'Three breaths taken. Mini tasks chosen.'", (await x.p.innerText("h1")).replace(/\s+/g, " ") === "Your first reset. Complete." &&
      (await x.p.textContent("#finishSub")) === "Three breaths taken. Mini tasks chosen.");
    ok("Sun: the date above the heading", /Sunday, October 4/i.test(await x.p.textContent(".dateline")));
    ok("Sun: timeline shows Sun 4 only, highlighted, marked Today", (await labels(x)) === "Sun 4" && (await fulls(x)) === "Sun 4" && (await slots(x))[0].today === "Today");
    ok("Sun: one day, no connector", await x.p.$eval(".progress li", (li) => getComputedStyle(li, "::before").content === "none"));
    ok("Sun: '1 morning reset completed', no 'Last 7 days', no 'Total'", (await count(x)) === "1 morning reset completed" && !(await x.p.$(".progress .window")));
    ok("Sun: titled 'Your progress', no ring, no %, no 'Next'", (await x.p.textContent("#progTitle")) === "Your progress" && !(await x.p.$(".ring")) && !/%|Next|of 7/.test(await x.p.textContent(".progress")));
    // Editing tasks on the completion screen doesn't add a completion
    await x.p.click("#iedit"); await x.t(700); await S.untickAll(x); await x.p.fill("#intent", "Water the plants"); await S.keep(x);
    ok("edit: the card shows the new task, the count is unchanged", (await x.p.textContent("#itext")) === "Water the plants" && (await count(x)) === "1 morning reset completed" && (await x.ls("fullDays")).length === 1);
    await S.finish(x);

    await jump(x, "2026-10-05T07:05:00");
    ok("Mon Begin: progress shows Sun 4, Mon 5 (today not done yet: hollow)", (await labels(x)) === "Sun 4, Mon 5" && (await fulls(x)) === "Sun 4");
    ok("Mon Begin: the usual headline (no gap)", !/Welcome back/.test(await x.p.textContent("h1")));
    await full(x);
    ok("Mon: 'Morning reset complete.'", (await x.p.textContent("h1")) === "Morning reset complete.");
    ok("Mon: Sun 4, Mon 5, both highlighted; 2 completed", (await labels(x)) === "Sun 4, Mon 5" && (await fulls(x)) === "Sun 4, Mon 5" && (await count(x)) === "2 morning resets completed");
    await S.finish(x);

    await jump(x, "2026-10-07T07:05:00");
    ok("Wed Begin after a gap: 'Welcome back.'", (await x.p.textContent("h1")) === "Welcome back.");
    await full(x);
    ok("Wed: 'Morning reset complete.' (not 'Welcome back')", (await x.p.textContent("h1")) === "Morning reset complete.");
    ok("Wed: Sun 4, Mon 5, Tue 6, Wed 7; highlighted Sun 4, Mon 5, Wed 7", (await labels(x)) === "Sun 4, Mon 5, Tue 6, Wed 7" && (await fulls(x)) === "Sun 4, Mon 5, Wed 7");
    ok("Wed: Tuesday is a hollow circle; today is the last date (no future placeholder)", (await slots(x))[2].state === "none" && (await slots(x))[3].today === "Today");
    ok("Wed: 3 morning resets completed", (await count(x)) === "3 morning resets completed");

    // Geometry: same-size circles, fixed spacing, left-aligned, connectors from circle edge to circle edge
    const g = await x.p.evaluate(() => {
      const lis = [...document.querySelectorAll(".progress li")], sec = document.querySelector(".progress").getBoundingClientRect();
      const dots = lis.map((li) => li.querySelector(".dot").getBoundingClientRect());
      const gaps = []; const conns = [];
      for (let i = 1; i < lis.length; i++) {
        gaps.push(Math.round(dots[i].left - dots[i - 1].left));
        const st = getComputedStyle(lis[i], "::before"), r = lis[i].getBoundingClientRect();
        const right = r.right - parseFloat(st.right), left = right - parseFloat(st.width);
        conns.push({ startsAfterPrev: left >= dots[i - 1].right - 0.5, endsBeforeThis: right <= dots[i].left + 0.5, style: st.borderTopStyle, top: r.top + parseFloat(st.top) - dots[i].top });
      }
      return { sizes: new Set(dots.map((d) => Math.round(d.width))).size, gaps: new Set(gaps).size, leftAligned: Math.abs(lis[0].getBoundingClientRect().left - sec.left) < 1, conns,
        widthOk: document.scrollingElement.scrollWidth <= innerWidth };
    });
    ok("circles all the same size, evenly spaced, left-aligned", g.sizes === 1 && g.gaps === 1 && g.leftAligned, g);
    ok("connectors are dotted and run from circle edge to circle edge", g.conns.every((c) => c.startsAfterPrev && c.endsBeforeThis && c.style === "dotted"), g.conns);
    await S.finish(x);

    // Partial: Thursday, breathing skipped
    await jump(x, "2026-10-08T07:05:00");
    await S.begin(x); await S.skipBreathing(x); await S.keep(x);
    ok("Thu partial: 'Your mini tasks are saved.', small mark (not full), count still 3", (await x.p.textContent("h1")) === "Your mini tasks are saved." &&
      (await slots(x))[4].state === "part" && (await count(x)) === "3 morning resets completed");
    await S.finish(x);

    // A week later the strip rolls: the latest 7 dates, "Last 7 days", "Total"
    await jump(x, "2026-10-12T07:05:00"); await full(x);
    ok("Mon 12: the latest 7 dates, Tue 6 to Mon 12", (await labels(x)) === "Tue 6, Wed 7, Thu 8, Fri 9, Sat 10, Sun 11, Mon 12");
    ok("Mon 12: 'Last 7 days' label and 'Total: 4 morning resets completed' (Sun 4, Mon 5 still count)", (await x.p.textContent(".progress .window")) === "Last 7 days" &&
      (await count(x)) === "Total: 4 morning resets completed");
    ok("Mon 12: 7 slots fit without sideways scrolling", await x.p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth));
    // Reopen later the same day: Today, no replayed celebration
    await jump(x, "2026-10-12T12:00:00");
    ok("reopen later: Today, no sunrise animation, same progress", !!(await x.p.$("#again")) && !(await x.p.$(".sunrise.rise")) && (await count(x)) === "Total: 4 morning resets completed");
    await x.c.close(); }

  // Small screen: 7 slots at 320 px
  { const x = await ctx(b, site.url, { when: "2026-10-04T07:10:00", device: "iPhone SE" }); await x.goto();
    await x.p.evaluate(() => { localStorage.setItem("fl.startDay", '"2026-09-20"'); localStorage.setItem("fl.fullDays", '["2026-09-28","2026-09-30","2026-10-01"]'); });
    await x.p.reload(); await x.t(700); await full(x);
    ok("320 px: 7 slots, no sideways scroll, labels don't overlap", await x.p.evaluate(() => {
      const w = [...document.querySelectorAll(".progress .wd")].map((e) => e.getBoundingClientRect());
      return document.scrollingElement.scrollWidth <= innerWidth && w.length === 7 && w.every((r, i) => i === 0 || r.left >= w[i - 1].right - 0.5);
    }));
    await x.c.close(); }

  // Older data: days from before beta-5 (finished, steps unknown) are never full; the timeline starts at the first one
  { const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00", init: () => {
      if (localStorage.getItem("fl.seeded")) return; localStorage.setItem("fl.seeded", "1");
      localStorage.setItem("fl.days", JSON.stringify(["2026-10-02", "2026-10-03"]));
      localStorage.setItem("fl.agreed", JSON.stringify({ version: "beta-5", on: "2026-10-02", how: "begin" }));
    } });
    await x.goto();
    ok("older data: starts at the first recorded day, never before", (await labels(x)) === "Fri 2, Sat 3, Sun 4, Mon 5");
    ok("older data: those days are small marks, not full; count 0", (await slots(x)).slice(0, 2).every((s) => s.state === "part") && (await count(x)) === "No full morning resets yet");
    await x.c.close(); }

  await b.close(); await site.close();
  done();
})();
