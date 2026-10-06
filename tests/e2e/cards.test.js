// The morning card: the question the night before (Ready) and in the morning (before Begin); the answer after the
// routine (Finish, Today) with a clear stop and tomorrow's question; one card per completed morning, in order.
// Run: node tests/e2e/cards.test.js
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter } = require("./helpers");
const { ok, done } = reporter("morning card: teaser, unlock, one per morning");
const click = async (x, sel) => { await x.p.click(sel); await x.t(700); };
const txt = (x, sel) => x.p.textContent(sel).then((t) => t.replace(/\s+/g, " ").trim());
const Q1 = "How long does a new habit really take?", Q2 = "What happens to a habit if you miss a day?", Q3 = "Why does linking a habit to a moment (“After my alarm, I'll…”) work better than willpower?";

(async () => {
  const site = await serve();
  const b = await chromium.launch();
  const x = await ctx(b, site.url, { when: "2026-10-04T20:30:00", device: "iPhone 14" }); await x.goto();
  await click(x, "#setupGo"); await click(x, "#stepNext"); await click(x, "#stepNext");
  ok("night before (Ready): 'Tomorrow's card', the first question only, 'Unlocks after your 3 breaths'",
    (await txt(x, "#cardTeaser .lbl")) === "Tomorrow's card" && (await txt(x, "#cardTeaser .q")) === Q1 &&
    (await txt(x, "#cardTeaser .lock")) === "Unlocks after your 3 breaths" && !/median of 66 days/.test(await txt(x, "#card")));
  await x.p.clock.setSystemTime(new Date("2026-10-05T07:05:00")); await x.p.reload(); await x.t(700);
  ok("the morning (before Begin): 'Today's card', the same question, no answer yet", (await txt(x, "#cardTeaser .lbl")) === "Today's card" &&
    (await txt(x, "#cardTeaser .q")) === Q1 && !/median of 66 days/.test(await txt(x, "#card")));
  await x.t(3000); await S.begin(x);
  ok("during the routine: no card", !(await x.p.$("#cardTeaser")) && !(await x.p.$("#mcard")));
  await S.skipBreathing(x); await S.keep(x);
  ok("Finish: the card unlocked: question, two sentences, 'That's all for today.', the source", (await txt(x, "#mcard h2")) === Q1 &&
    /^In a study of 96 people, a daily habit took a median of 66 days/.test(await txt(x, "#mcard p:not(.lbl):not(.end):not(.src)")) &&
    (await txt(x, "#mcard .end")) === "That's all for today." && /^Source: Lally et al\./.test(await txt(x, "#mcard .src")));
  ok("...and tomorrow's question under it", (await txt(x, "#cardNext")) === "Tomorrow's card: " + Q2);
  await S.finish(x);
  ok("Today: the same card (doing the routine again wouldn't change it)", (await txt(x, "#mcard h2")) === Q1);
  await x.p.click("#again"); await x.t(700); await S.skipBreathing(x); await S.keep(x);
  ok("a second routine the same day: still the same card", (await txt(x, "#mcard h2")) === Q1);
  await S.finish(x);
  await x.p.clock.setSystemTime(new Date("2026-10-06T07:05:00")); await x.p.reload(); await x.t(700);
  ok("day 2 (Begin): today's card is the second question", (await txt(x, "#cardTeaser .lbl")) === "Today's card" && (await txt(x, "#cardTeaser .q")) === Q2);
  // A missed day doesn't skip a card: the next one is the next in order
  await x.p.clock.setSystemTime(new Date("2026-10-08T07:05:00")); await x.p.reload(); await x.t(700);
  ok("after a missed day: still the second question (one per completed morning, none skipped)", (await txt(x, "#cardTeaser .q")) === Q2);
  await S.begin(x); await S.skipBreathing(x); await S.keep(x);
  ok("...unlocks the second card; tomorrow's is the third", (await txt(x, "#mcard h2")) === Q2 && (await txt(x, "#cardNext")) === "Tomorrow's card: " + Q3);
  await x.c.close();

  // After 14 completed mornings it starts again from the first
  { const days = Array.from({ length: 14 }, (_, i) => `2026-09-${String(10 + i).padStart(2, "0")}`);
    const y = await ctx(b, site.url, { when: "2026-10-05T07:05:00", device: "Pixel 7",
      init: (d) => { localStorage.setItem("fl.days", JSON.stringify(d)); localStorage.setItem("fl.everStarted", "true"); localStorage.setItem("fl.startDay", JSON.stringify(d[0])); }, initArg: days });
    await y.goto();
    ok("after all 14: back to the first card", (await txt(y, "#cardTeaser .q")) === Q1);
    await y.c.close(); }

  // The bank itself: 14 cards, each a question, at most two sentences of answer, and a source
  { const y = await ctx(b, site.url, { when: "2026-10-05T07:05:00" }); await y.goto();
    const html = require("fs").readFileSync(require("path").join(__dirname, "..", "..", "index.html"), "utf8");
    const start = html.indexOf("[", html.indexOf("const MORNING_CARDS = ["));
    const cards = new Function("return " + html.slice(start, html.indexOf("\n  ];", start) + 4))();
    const twoSentences = (a) => (a.match(/[.!?](?=\s+[A-Z“"]|\s*$)/g) || []).length <= 2;
    ok("the bank: 14 cards, each a question, an answer of at most two sentences, and a source", cards.length === 14 &&
      cards.every((c) => c.q.endsWith("?") && twoSentences(c.a) && c.src.length >= 4), cards.filter((c) => !twoSentences(c.a)).map((c) => c.q));
    await y.c.close(); }

  await b.close(); await site.close();
  done();
})();
