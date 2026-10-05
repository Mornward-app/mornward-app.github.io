// Arriving on a phone from the computer's QR code: the home-screen steps open by themselves over Welcome, once,
// for that phone. Run: node tests/e2e/qr-guide.test.js
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
    ok(`${device}: a short reason, and 'Later' to close`, (await x.p.textContent("#guideWhy")) === "One tap from your home screen when you wake." &&
      (await x.p.textContent("#installGuide [data-guide-close].secondary")) === "Later");
    ok(`${device}: nothing agreed or sent by it`, !(await x.ls("agreed")) && x.bodies.length === 0);
    await x.p.click("#installGuide [data-guide-close].secondary"); await x.t(300);
    ok(`${device}: Later closes it; Welcome is there`, !(await x.p.$("#installGuide")) && !!(await x.p.$("#setupGo")));
    await x.p.reload(); await x.t(1000);
    ok(`${device}: it opens once per phone (not again on a reload)`, !(await x.p.$("#installGuide")));
    await x.c.close();
  }

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
    ok("Android: tapping it opens Chrome's dialog", (await x.p.evaluate(() => window.__prompted)) === 1 && !(await x.p.$("#installGuide")));
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

  await b.close(); await site.close();
  done();
})();
