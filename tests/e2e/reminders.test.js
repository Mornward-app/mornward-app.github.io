// Issue 9: the calendar files (cal/HHMM.ics) and Google Calendar link are valid and say what we mean; setup taps are counted as taps.
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
  ok("one calendar button for this phone; the rest folded under More options", (await x.p.$$("#remindSec .rempane:not([hidden]) #remGoogle, #remindSec .rempane:not([hidden]) #remIcs")).length === 1 && !(await x.p.$("#remMore[open]")));
  await x.p.click("#remMore summary");

  // Copy says what happens, and no more
  const more = await x.p.textContent("#remMore");
  const android = await x.p.$$eval('#remMore [data-pane="android"]', (l) => l[0].textContent), ios = await x.p.$$eval('#remMore [data-pane="ios"]', (l) => l[0].textContent);
  ok("copy: Google — save it there, set the notification; how to stop it", /Save it there/.test(android) && /At time of event/.test(android) && /Repeats every morning until you delete it in your calendar/.test(more));
  ok("copy: Apple — its own add sheet, tap Add, check the alert; how to stop it", /Apple Calendar's own add sheet/.test(ios) && /Tap Add/.test(ios) && /check the alert/.test(ios) && !/pops up/.test(ios + android));
  ok("copy: the first reminder is stated as a real date and time", /^First reminder: \w+day, \w+ \d+ at /.test(await x.p.textContent("#remWhen")));
  ok("no alarm Shortcut (it could only open Safari, not the home-screen app)", !(await x.p.$("#remShortcut")) && !/Shortcuts/.test(await x.p.textContent("#remindSec")));

  // Calendar file: a real link to a file on the site (cal/HHMM.ics), so iPhone shows Apple's add sheet; nothing is made on the phone
  await x.p.click('[data-rem-os="ios"]'); await x.p.fill("#remAt", "06:30");
  const file = async () => { const href = await x.p.getAttribute("#remIcs", "href"); const r = await x.p.request.get(new URL(href, x.p.url()).href);
    const f = path.join(require("os").tmpdir(), "mw-" + href.replace(/\W/g, "") + ".ics"); const ics = await r.text(); fs.writeFileSync(f, ics);
    return { href, f, ics, type: r.headers()["content-type"] }; };
  const one = await file();
  ok("calendar file: the Apple button links to the file for the time shown (both links)", one.href === "cal/0630.ics" && (await x.p.getAttribute("#remIcsAlt", "href")) === "cal/0630.ics");
  ok("calendar file: served as text/calendar", /^text\/calendar/.test(one.type), one.type);
  const L = lint(one.ics);
  ok("calendar file: valid lines (CRLF, ≤ 75 octets, folding), required properties, one event with one alarm", L.problems.length === 0, L.problems);
  ok("calendar file: 06:30 floating local time, 5 minutes, every morning until deleted", /^\d{8}T063000$/.test(L.get("DTSTART")) && L.get("DURATION") === "PT5M" && L.get("RRULE") === "FREQ=DAILY");
  ok("calendar file: an alert at the event time", L.get("TRIGGER") === "PT0M" && L.get("ACTION") === "DISPLAY");
  ok("calendar file: DTSTAMP is UTC with seconds", /^\d{8}T\d{6}Z$/.test(L.get("DTSTAMP")));
  ok("calendar file: the alert says where to open Mornward: 'Open Mornward from your home screen'", L.get("SUMMARY") === "Open Mornward from your home screen" &&
    one.ics.includes("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Open Mornward from your home screen\r\n"));
  ok("calendar file: no link (on iPhone it would open Safari, not the home-screen app)", !/https?:|URL:/.test(one.ics) &&
    unescape(L.get("DESCRIPTION")) === "Three breaths, one mini task. About a minute.", L.get("DESCRIPTION"));
  ok("calendar file: SEQUENCE 1, so re-adding updates an older event with the same UID", L.get("SEQUENCE") === "1");
  ok("calendar file: one UID per time, the same for everyone (no ID of any kind)", L.get("UID") === "mornward-0630@mornward.app" && !one.ics.includes((await x.ls("deviceId")).replace(/-/g, "")) && !one.ics.includes(await x.ls("deviceId")));
  const parsed = icalParse(one.f);
  if (parsed) ok("calendar file: an independent parser (python icalendar) reads the same event", parsed.floating && /T06:30:00$/.test(parsed.start) &&
    parsed.duration_min === 5 && JSON.stringify(parsed.rrule) === '{"FREQ":["DAILY"]}' && parsed.alarms.length === 1 && parsed.alarms[0].trigger_min === 0 && parsed.method === "PUBLISH", parsed);
  else ok("calendar file: independent parse skipped (no python icalendar; set ICAL_PYTHONPATH)", true);
  await x.p.fill("#remAt", "07:30"); const later = await file();
  ok("calendar file: changing the time changes the link", later.href === "cal/0730.ics" && lint(later.ics).get("DTSTART").endsWith("T073000"));
  const all = fs.readdirSync(path.join(__dirname, "..", "..", "cal"));
  ok("calendar files: one for every minute of the day, all valid", all.length === 1440 && all.every((n) => { const t = fs.readFileSync(path.join(__dirname, "..", "..", "cal", n), "utf8");
    const l = lint(t); return l.problems.length === 0 && l.get("DTSTART").endsWith("T" + n.slice(0, 4) + "00") && l.get("UID") === `mornward-${n.slice(0, 4)}@mornward.app`; }));

  // Google Calendar link
  await x.p.click('[data-rem-os="android"]'); await x.p.fill("#remAt", "06:45");
  const u = new URL(await x.p.getAttribute("#remGoogle", "href"));
  ok("Google link: tomorrow 06:45 to 06:50, the phone's time zone, every morning until deleted", u.searchParams.get("dates") === "20261006T064500/20261006T065000" &&
    u.searchParams.get("ctz") === "Asia/Bangkok" && u.searchParams.get("recur") === "RRULE:FREQ=DAILY" && u.searchParams.get("action") === "TEMPLATE");

  // What's counted: the tap, once a day per kind of tap, never "set up" or "delivered"
  await x.p.click("#remGoogle"); await x.t(200); await x.p.click("#remGoogle"); await x.t(200);
  await x.p.click('[data-rem-os="ios"]'); await x.p.click("#remIcs"); await x.t(200); await x.p.click("#remIcs"); await x.t(200);
  ok("calendar tap: the page stays put (the file opens on its own)", /\/(index\.html)?(\?|#|$)/.test(new URL(x.p.url()).pathname + new URL(x.p.url()).search) && !!(await x.p.$("#remIcs")), x.p.url());
  await drain(x);
  const taps = x.rows().filter((r) => r.kind === "reminder_setup").map((r) => r.data.action).sort();
  ok("counted: one row per kind of tap per day (google_link, calendar_file)", JSON.stringify(taps) === '["calendar_file","google_link"]', taps);
  ok("counted: nothing claims a reminder exists", x.bodies.every((bd) => !/installed|delivered|reminder_on|saved_reminder/.test(bd)));
  await x.c.close();
  await b.close(); await site.close();
  done();
})();
