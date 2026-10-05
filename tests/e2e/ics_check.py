"""Independent parse of a Mornward calendar file with the `icalendar` library (pip install icalendar).
Prints one JSON object with what a calendar app would read. Usage: python3 ics_check.py file.ics"""
import json
import sys

import icalendar

raw = open(sys.argv[1], "rb").read()
cal = icalendar.Calendar.from_ical(raw)
ev = [c for c in cal.walk("VEVENT")][0]
al = [c for c in ev.walk("VALARM")]
start = ev.decoded("DTSTART")
print(json.dumps({
    "method": str(cal.get("METHOD")),
    "uid": str(ev.get("UID")),
    "sequence": int(ev.get("SEQUENCE")),
    "start": start.isoformat(),
    "floating": start.tzinfo is None,
    "duration_min": ev.decoded("DURATION").total_seconds() / 60,
    "rrule": {k: v for k, v in ev.get("RRULE").items()},
    "summary": str(ev.get("SUMMARY")),
    "description": str(ev.get("DESCRIPTION")),
    "url": str(ev.get("URL")),
    "alarms": [{"action": str(a.get("ACTION")), "trigger_min": a.decoded("TRIGGER").total_seconds() / 60} for a in al],
}, default=str))
