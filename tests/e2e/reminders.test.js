// Issue 9: the calendar file and Google Calendar link are valid and say what we mean; setup taps are counted as taps.
// Delivery (an alert actually appearing) can only be checked on real phones: see docs/real-device-checklist.md.
// Run: node tests/e2e/reminders.test.js   (optional: the `icalendar` Python package for an independent parse)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { serve, ctx, steps: S, reporter } = require("./helpers");
const { ok, done } = reporter("reminders: calendar file, Google link, what's counted");
async function drain(x) { for (let i = 0; i < 40 && ((await x.ls("outbox")) || []).length; i++) { await x.t(100); await x.p.waitForTimeout(50); } }

// RFC 5545: CRLF line ends, lines at most 75 octets, folded lines start with a space
function lint(ics) {
  const problems = [];
  if (!ics.endsWith("\r\n")) problems.push("no CRLF at end");
  const lines = ics.slice(0, -2).split("\r\n");
  for (const l of lines) {
    if (Buffer.byteLength(l, "utf8") > 75) problems.push("line over 75 octets: " + l.slice(0, 30));
    if (/\n|\r/.test(l)) problems.push("bare LF/CR");
  }
  const unfolded = ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
  const props = unfolded.map((l) => l.slice(0, l.search(/[:;]/)));
  for (const need of ["BEGIN", "VERSION", "PRODID", "UID", "DTSTAMP", "DTSTART", "END"]) if (!props.includes(need)) problems.push("missing " + need);
  const pairs = [["VCALENDAR", 1], ["VEVENT", 1], ["VALARM", 1]];
  for (const [c, n] of pairs) if (unfolded.filter((l) => l === "BEGIN:" + c).length !== n || unfolded.filter((l) => l === "END:" + c).length !== n) problems.push("BEGIN/END " + c);
  return { problems, get: (p) => (unfolded.find((l) => l.startsWith(p + ":")) || "").slice(p.length + 1) };
}
const unescape = (v) => v.replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1");
function icalParse(file) {
  try { return JSON.parse(execFileSync("python3", [path.join(__dirname, "ics_check.py"), file], { env: { ...process.env, PYTHONPATH: process.env.ICAL_PYTHONPATH || "" } }).toString()); }
  catch { return null; }
}

(async () => {
  const site = await serve();
  const b = await chromium.launch();
  const x = await ctx(b, site.url, { when: "2026-10-05T07:10:00+07:00", timezoneId: "Asia/Bangkok" }); await x.goto();
  await S.begin(x); await S.skipBreathing(x); await S.keep(x); await S.finish(x);
  await x.p.click("#remindSec summary");

  // Copy says what happens, and no more
  const android = await x.p.textContent('[data-pane="android"]'), ios = await x.p.textContent('[data-pane="ios"]');
  ok("copy: Google — finish saving it there, set the notification; how to stop it", /Finish saving it there/.test(android) && /At time of event/.test(android) && /To stop it, delete the event/.test(android));
  ok("copy: Apple — open it to add it, check the alert; how to stop it", /Open it to add it to Calendar/.test(ios) && /check the alert/.test(ios) && /To stop it, delete the event/.test(ios) && !/pops up/.test(ios + android));
  ok("copy: the first reminder is stated as a real date and time", /^First reminder: \w+day, \w+ \d+ at /.test(await x.p.textContent("#remWhen")));
  ok("copy: the Shortcut — how to remove it", /delete it under Automation in Shortcuts/.test(await x.p.textContent("#remShortcut")));

  // Calendar file, made at 07:10 for 06:30 (already past today, so tomorrow)
  await x.p.click('[data-rem-os="ios"]'); await x.p.fill("#remAt", "06:30");
  const file = async () => { const dl = x.p.waitForEvent("download"); await x.p.click("#remIcs"); const f = await (await dl).path(); return { f, ics: fs.readFileSync(f, "utf8") }; };
  const one = await file(), two = await file();
  const L = lint(one.ics);
  ok("calendar file: valid lines (CRLF, ≤ 75 octets, folding), required properties, one event with one alarm", L.problems.length === 0, L.problems);
  ok("calendar file: starts tomorrow 06:30 as floating local time, 5 minutes, daily ×7", L.get("DTSTART") === "20261006T063000" && L.get("DURATION") === "PT5M" && L.get("RRULE") === "FREQ=DAILY;COUNT=7");
  ok("calendar file: an alert at the event time", L.get("TRIGGER") === "PT0M" && L.get("ACTION") === "DISPLAY");
  ok("calendar file: DTSTAMP is UTC with seconds", /^\d{8}T\d{6}Z$/.test(L.get("DTSTAMP")));
  ok("calendar file: text escaped correctly", unescape(L.get("DESCRIPTION")) === "Before the scroll: https://mornward.app/?via=calendar\nThree breaths, one mini task. About a minute.", L.get("DESCRIPTION"));
  const L2 = lint(two.ics);
  ok("calendar file: the same UID both times (one phone, one event), SEQUENCE 0 then 1", L.get("UID") === L2.get("UID") && L.get("SEQUENCE") === "0" && L2.get("SEQUENCE") === "1" && /^[0-9a-f]{32}@mornward\.app$/.test(L.get("UID")));
  ok("calendar file: the UID is not the stats ID", !L.get("UID").includes((await x.ls("deviceId")).replace(/-/g, "")));
  const parsed = icalParse(one.f);
  if (parsed) ok("calendar file: an independent parser (python icalendar) reads the same event", parsed.floating && parsed.start === "2026-10-06T06:30:00" &&
    parsed.duration_min === 5 && JSON.stringify(parsed.rrule) === '{"FREQ":["DAILY"],"COUNT":[7]}' && parsed.alarms.length === 1 && parsed.alarms[0].trigger_min === 0 && parsed.method === "PUBLISH", parsed);
  else ok("calendar file: independent parse skipped (no python icalendar; set ICAL_PYTHONPATH)", true);
  await x.p.fill("#remAt", "07:30"); const later = lint((await file()).ics);
  ok("calendar file: a time still ahead today starts today", later.get("DTSTART") === "20261005T073000");

  // Google Calendar link
  await x.p.click('[data-rem-os="android"]'); await x.p.fill("#remAt", "06:45");
  const u = new URL(await x.p.getAttribute("#remGoogle", "href"));
  ok("Google link: tomorrow 06:45 to 06:50, the phone's time zone, daily ×7", u.searchParams.get("dates") === "20261006T064500/20261006T065000" &&
    u.searchParams.get("ctz") === "Asia/Bangkok" && u.searchParams.get("recur") === "RRULE:FREQ=DAILY;COUNT=7" && u.searchParams.get("action") === "TEMPLATE");

  // What's counted: the tap, once a day per kind of tap, never "set up" or "delivered"
  await x.p.click("#remGoogle"); await x.t(200); await x.p.click("#remGoogle"); await x.t(200);
  await x.p.click('[data-rem-os="ios"]'); await x.p.click("#remShortcut summary"); await x.p.click("#remCopy"); await x.t(200);
  // the shortcut tap is counted after the clipboard write finishes (real time, not the page clock)
  for (let i = 0; i < 50 && !x.rows().some((r) => r.data.action === "shortcut_link"); i++) { await drain(x); await x.p.waitForTimeout(100); await x.t(100); }
  const taps = x.rows().filter((r) => r.kind === "reminder_setup").map((r) => r.data.action).sort();
  ok("counted: one row per kind of tap per day (google_link, calendar_file, shortcut_link)", JSON.stringify(taps) === '["calendar_file","google_link","shortcut_link"]', taps);
  ok("counted: nothing claims a reminder exists", x.bodies.every((bd) => !/installed|delivered|reminder_on|saved_reminder/.test(bd)));
  await x.c.close();
  await b.close(); await site.close();
  done();
})();
