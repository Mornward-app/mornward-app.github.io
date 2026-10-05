#!/usr/bin/env python3
"""Writes cal/HHMM.ics: one calendar file per minute of the day (1440 small files), served by GitHub Pages as
text/calendar. Opening one from a link makes iPhone Safari show Apple's own "Add to Calendar" sheet (a calendar file
made inside the page is downloaded to Files instead). Each event: every morning at that local ("floating") time,
5 minutes, an alert at the time, no end date, and the mornward.app link. The same time always has the same UID,
so adding it again updates rather than duplicates (where the calendar app supports that).
Run: python3 tools/make-calendar-files.py   (then commit cal/)"""
import os
ROOT = os.path.join(os.path.dirname(__file__), "..", "cal")
os.makedirs(ROOT, exist_ok=True)
LINK = "https://mornward.app/?via=calendar"
def esc(t): return t.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
def fold(line):
    out, cur = [], b""
    for ch in line:
        b = ch.encode()
        if len(cur) + len(b) > (75 if not out else 74):
            out.append(cur.decode()); cur = b""
        cur += b
    out.append(cur.decode())
    return "\r\n ".join(out)
for h in range(24):
    for m in range(60):
        hm = f"{h:02d}{m:02d}"
        lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mornward//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
                 "BEGIN:VEVENT", f"UID:mornward-{hm}@mornward.app", "SEQUENCE:0", "DTSTAMP:20261005T000000Z",
                 f"DTSTART:20261001T{hm}00", "DURATION:PT5M", "RRULE:FREQ=DAILY",
                 "SUMMARY:" + esc("Mornward: three breaths, one mini task"),
                 "DESCRIPTION:" + esc(f"Before the scroll: {LINK}\nThree breaths, one mini task. About a minute."),
                 f"URL:{LINK}",
                 "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc("Before the scroll: one mini task"), "TRIGGER:PT0M", "END:VALARM",
                 "END:VEVENT", "END:VCALENDAR"]
        with open(os.path.join(ROOT, hm + ".ics"), "w", newline="") as f:
            f.write("\r\n".join(fold(l) for l in lines) + "\r\n")
print("wrote", len(os.listdir(ROOT)), "files")
