// Arriving on a phone from the computer's QR code (or a social link): the home-screen steps open over Welcome and stay
// until it's added (iPhone: then open it from the icon and set up there). Run: node tests/e2e/qr-guide.test.js
const { chromium } = require("playwright");
const { serve, ctx, reporter } = require("./helpers");
const { ok, done } = reporter("QR arrival: home-screen steps open by themselves");
const WHEN = "2026-10-05T20:00:00";
const pressed = (x) => x.p.$$eval('#installGuide [data-os][aria-pressed="true"]', (l) => l.map((e) => e.dataset.os));

(async () => {
  const site = await serve();
  const b = await chromium.launch();

  for (const [device, os] of [["iPhone 13", "ios"], ["Pixel 7", "android"]]) {
    const x = await ctx(b, site.url, { when: WHEN, device }); await x.goto("?from=qr"); await x.t(1000);
    ok(`${device}: from the QR code, the steps open over Welcome`, !!(await x.p.$("#installGuide")) && !!(await x.p.$("#setupGo")));
    ok(`${device}: ${os === "ios" ? "iPhone" : "Android"} is picked for this phone`, JSON.stringify(await pressed(x)) === JSON.stringify([os]));
    ok(`${device}: required: a reason, 'I've added it', and no close, no Later`, (await x.p.textContent("#guideWhy")) ===
      (os === "ios" ? "Add it first, then set up from the icon. Safari won't keep your mornings." : "Add it first. One tap when you wake.") &&
      (await x.p.textContent("#installGuide [data-guide-added]")) === "I've added it" && !(await x.p.$("#installGuide [data-guide-close]")));
    ok(`${device}: nothing agreed or sent by it`, !(await x.ls("agreed")) && x.bodies.length === 0);
    await x.p.keyboard.press("Escape"); await x.p.mouse.click(200, 40); await x.t(300);
    ok(`${device}: Escape and tapping outside don't close it`, !!(await x.p.$("#installGuide")));
    await x.p.evaluate(() => { document.querySelector("#setupGo").click(); document.querySelector("#beginNow").click(); }); await x.t(500);
    ok(`${device}: Welcome's buttons behind it start nothing`, !!(await x.p.$("#setupGo")) && !(await x.ls("onboard")) && !(await x.ls("agreed")) && !!(await x.p.$("#installGuide")));
    await x.p.reload(); await x.t(1000);
    ok(`${device}: back on every visit until it's added`, !!(await x.p.$("#installGuide")));
    if (os === "ios") {
      await x.p.click("#installGuide [data-guide-added]"); await x.t(300);
      ok("iPhone: after 'I've added it', the sheet stays: open it from your home screen, set up there",
        (await x.p.textContent("#guideTitle")) === "Now open it from your home screen" && (await x.p.textContent("#guideOpen")) === "Set up there. You can close Safari." &&
        !!(await x.p.$("#guideIcon")) && !(await x.p.$("[data-guide-added]")));
      await x.p.reload(); await x.t(1000);
      ok("iPhone: Safari again: straight to 'Now open it from your home screen'", (await x.p.textContent("#guideTitle")) === "Now open it from your home screen");
      await x.p.click("#guideAgain"); await x.t(300);
      ok("iPhone: 'Show the steps again' brings the steps back", !!(await x.p.$("#guideSteps")) && !!(await x.p.$("[data-guide-added]")));
      const start = await x.p.evaluate(() => JSON.parse(decodeURIComponent(document.querySelector('link[rel="manifest"]').href.replace(/^data:application\/manifest\+json,/, ""))).start_url);
      ok("iPhone: the icon opens Mornward from the QR link (set up there)", /\/\?from=qr$/.test(start), start);
    } else {
      await x.p.click("#installGuide [data-guide-added]"); await x.t(300);
      ok("Android: 'I've added it' (Chrome and the app share storage): on to Welcome", !(await x.p.$("#installGuide")) && !!(await x.p.$("#setupGo")));
      await x.p.reload(); await x.t(1000);
      ok("Android: not again after that", !(await x.p.$("#installGuide")));
    }
    await x.c.close();
  }

  // Can't add it (an older phone, an app's browser): "Can't find it?" → "Continue in this browser", remembered
  { const x = await ctx(b, site.url, { when: WHEN, device: "iPhone 13" }); await x.goto("?from=qr"); await x.t(1000);
    await x.p.click("#installGuide .cantfind summary");
    ok("'Continue in this browser' is under 'Can't find it?'", (await x.p.textContent("#guideHere")) === "Continue in this browser");
    await x.p.click("#guideHere"); await x.t(300);
    ok("...it closes the steps; Welcome works", !(await x.p.$("#installGuide")) && !!(await x.p.$("#setupGo")));
    await x.p.reload(); await x.t(1000);
    ok("...and they don't come back in this browser", !(await x.p.$("#installGuide")));
    await x.p.click("#setupGo"); await x.t(700); await x.p.click("#stepNext"); await x.t(700);
    ok("...setup in Safari: no '✓ On your home screen' (Safari can't know)", !(await x.p.$("#homeTick")));
    await x.c.close(); }
  // The installed app opened from the icon: never gated, setup there
  { const x = await ctx(b, site.url, { when: WHEN, device: "iPhone 13", init: () => { Object.defineProperty(navigator, "standalone", { get: () => true }); } });
    await x.goto("?from=qr"); await x.t(1000); await x.p.click("#setupGo"); await x.t(700);
    ok("the icon (from the QR link): no steps, setup opens", !(await x.p.$("#installGuide")) && !!(await x.p.$("#stepNext")));
    await x.c.close(); }

  // Android with Chrome's own dialog: one tap from the steps
  { const x = await ctx(b, site.url, { when: WHEN, device: "Pixel 7", init: () => {
      window.__prompted = 0;
      window.addEventListener("load", () => setTimeout(() => {
        const e = new Event("beforeinstallprompt");
        e.prompt = () => { window.__prompted++; return Promise.resolve(); };
        e.userChoice = Promise.resolve({ outcome: "dismissed" });
        window.dispatchEvent(e);
      }, 4000));
    } });
    await x.goto("?from=qr"); await x.t(1000);
    ok("Android: the steps open before Chrome offers its dialog", !!(await x.p.$("#installGuide")) && !(await x.p.$("#guideInstall")));
    await x.t(3000); await x.p.waitForTimeout(300);
    ok("Android: when Chrome offers it, a one-tap 'Add to home screen' appears in the open steps", (await x.p.textContent("#guideInstall")) === "Add to home screen");
    await x.p.click("#guideInstall"); await x.t(300); await x.p.waitForTimeout(200);
    ok("Android: tapping it opens Chrome's dialog; said no, the steps come back", (await x.p.evaluate(() => window.__prompted)) === 1 && !!(await x.p.$("#installGuide")) && !(await x.p.$("#guideInstall")));
    await x.c.close(); }

  // Not from the QR code, on a computer, or in the installed app: nothing opens by itself
  { const x = await ctx(b, site.url, { when: WHEN, device: "iPhone 13" }); await x.goto(); await x.t(1000);
    ok("phone, no QR link: nothing opens by itself", !(await x.p.$("#installGuide")));
    await x.c.close(); }
  { const x = await ctx(b, site.url, { when: WHEN, device: "Desktop Chrome" }); await x.goto("?from=qr"); await x.t(1000);
    ok("computer with the QR link: nothing opens", !(await x.p.$("#installGuide")));
    await x.c.close(); }
  { const x = await ctx(b, site.url, { when: WHEN, device: "iPhone 13", init: () => { Object.defineProperty(navigator, "standalone", { get: () => true }); } });
    await x.goto("?from=qr"); await x.t(1000);
    ok("installed app opened with the QR link: nothing opens", !(await x.p.$("#installGuide")));
    await x.c.close(); }
  // Someone who already uses Mornward on this phone: no steps over their Begin screen
  { const x = await ctx(b, site.url, { when: WHEN, device: "iPhone 13", init: () => {
      localStorage.setItem("fl.everStarted", "true"); localStorage.setItem("fl.startDay", '"2026-10-04"'); localStorage.setItem("fl.days", '["2026-10-04"]');
      localStorage.setItem("fl.agreed", JSON.stringify({ version: "beta-5", on: "2026-10-04", how: "begin" })); } });
    await x.goto("?from=qr"); await x.t(1000);
    ok("an existing user arriving from the QR code: Begin, no steps on top", !!(await x.p.$("#begin")) && !(await x.p.$("#installGuide")));
    await x.c.close(); }

  // A social app's link (Reddit post or ad, Instagram, TikTok…): the same steps, by themselves, on both phones
  for (const [device, q] of [["iPhone 14", "?from=reddit"], ["Pixel 7", "?from=reddit"], ["iPhone 14", "?from=redditads"], ["Pixel 7", "?from=instagram"]]) {
    const x = await ctx(b, site.url, { when: WHEN, device }); await x.goto(q); await x.t(1000);
    ok(`${device} ${q}: the home-screen steps open over Welcome`, !!(await x.p.$("#installGuide")) && !!(await x.p.$("#setupGo")));
    await x.c.close(); }
  for (const q of ["", "?from=newsletter"]) {
    const x = await ctx(b, site.url, { when: WHEN, device: "iPhone 14" }); await x.goto(q); await x.t(1000);
    ok(`iPhone ${q || "(no link source)"}: no steps on top (only the QR code and social links open them)`, !(await x.p.$("#installGuide")) && !!(await x.p.$("#setupGo")));
    await x.c.close(); }

  await b.close(); await site.close();
  done();
})();
