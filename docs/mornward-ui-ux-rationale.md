# Mornward: UI/UX rationale for the one-minute routine

**Objective:** before the scroll, one clear intention.
**Flow:** Begin → three breaths → one intention → Finish. Android first, iPhone supported equally.

This document explains why each design decision was made, how it's supposed to work, what we don't know, what
could go wrong for the person using it, and how we'll find out. **Every retention effect below is a hypothesis.**
Nothing here has been tested with real users yet. The starting figure behind the redesign (about 15 setups, 0%
return) is itself unverified; see the audit in [`supabase/ANALYTICS.md`](../supabase/ANALYTICS.md).

## Decisions

| Decision | Mechanism (how it should help) | Uncertainty | Risk to the person | Validation |
| --- | --- | --- | --- | --- |
| **One prominent action per screen** (Begin, Pause, Save my intention, Finish), with secondary choices as plain text buttons | A half-awake person shouldn't have to choose. One dark button makes the next step obvious and cuts the time from opening to starting. | We don't know whether one minute is short enough to beat the urge to scroll, or too thin to feel worth opening. | Little. The secondary paths (Skip, Edit) are visible text, never hidden, so nobody is trapped in the flow. | `routine_daily`: started → finished. Compare the share of devices that finish their first routine with beta-3's first reset. |
| **Accurate progress**: "Breath 1 of 3", timers that really run 4 s in / 6 s out, counting a full in + out as one breath | Finite, honest progress tells people how much is left; the end is in sight from the first second. | Three breaths may feel too short to calm anyone, or too long when rushed. The pace (4/6) is a common comfortable rhythm, not tuned for anyone. | A fixed pace can feel uncomfortable for some people (breathing conditions, anxiety). Hence "At your own pace", no holds, and Pause/Skip always present. | `breathing_skipped.breaths_done`: if most skips happen at 0 breaths, people don't want breathing at all; at 2, it's too long. |
| **Pause, Skip, Edit everywhere they apply** | Control reduces the feeling of being managed. Pause also covers real life: a call, a child, the phone locking (the page pauses itself when hidden). | People may skip everything and get little from the routine. | None added: skipping is always allowed and never punished. Skipping the intention says so plainly and invents nothing. | Ratio of `breathing_skipped` to `breathing_completed`, and of `intention_skipped` to `intention_saved`. |
| **A personal intention, in the person's own words** ("What matters this morning? Choose one small thing.") | Writing your own small goal is more specific to you than any quote or checklist we could show. "Something small is enough" keeps the bar low. | Many people may not know what to write at 7 am. Typing on a phone keyboard while half awake is effort. | Low. The text never leaves the phone. Blank or whitespace-only saves are refused, and an earlier intention is never overwritten with a blank. | `intention_saved` per started routine; how often people Edit (not counted, by design) is a gap. Five-person usability test: ask what they wrote and whether it felt useful. |
| **Familiar layout**: heading, one line of body text, the button in the lower half, system font, 24 px margins, 54 px buttons | Nothing to learn. System fonts load instantly and match the phone; the button sits where thumbs reach. | The calm, plain look may read as "unfinished" to some people. | None known. | Ask in user tests whether it felt trustworthy. Watch first-routine completion. |
| **A clear finish**: "You're ready." + the intention + "Take it into your day." → Finish → a stable "Today's intention" screen | The routine has an end, so it doesn't compete with the feed for attention; the intention is the last thing seen. Finish has no ratings, forms, streaks or install prompts. | A clean ending may also mean nothing pulls people back tomorrow. That's the main open question. | Low. Removing streaks removes the guilt of breaking one. | Next-local-day return and day-7 retention in `routine_metrics`, read as counts first. |
| **Remembered state**: same-day reopen shows today's intention with Edit; breathing resumes paused; drafts survive reloads; a new day offers the routine again; older intentions are listed with their dates | Reopening the app should feel like picking something up, not starting over. Dating every entry means yesterday's intention is never mistaken for today's. | Some people may want yesterday's intention carried over automatically. We chose not to: copying it forward would present yesterday's choice as today's. | Low. Intentions are only on the phone; clearing browser data deletes them, which the privacy section says plainly. On iPhone, the home-screen icon and Safari keep separate histories. | Tests in `qa/redesign/routine.js` cover reloads, drafts, new days, page left open overnight and routines that cross midnight. Real-device check still needed on iPhone. |
| **Optional reminders only**: a calendar event the person adds themselves, offered after Finish, never on load; no notification permission request | A reminder at the right moment may help people remember the app exists. A calendar event works on both platforms without permissions. | We can't tell whether anyone saves the event, so `reminder_opt_in` isn't sent. We also can't attribute returns to reminders. | Low. No permission prompt, nothing scheduled without the person's own calendar app. | `via: "calendar"` on `routine_started` shows routines opened from the reminder link. A real-device test on iPhone is still needed for the calendar file. |
| **Readable text and contrast**: 17/25 body, 32/38 headings, 14/20 support text, sizes in `rem`, layout that reflows and scrolls, safe areas, `100dvh`, reduced motion | People open this half awake, sometimes with large-text settings. | Measured in Chromium emulation only. | None known. | Contrast (WCAG): primary text #20344C on #EDF5FC 11.5:1, secondary #4B6075 5.9:1, button text white on #25374D 12.1:1, field edge #6B7F94 on white 4.1:1 (3:1 needed). The sunrise colour #F2D77A is decorative only (1.3:1, never used for text). `qa/redesign/layout.js` checks sideways scrolling, tap targets (44 px minimum), labels, focus and keyboard order at 360/390/430/768, 375×667, 200% zoom and 200% text. |

Two supporting decisions:

- **Consent on Begin.** New people see one short note under Begin: free, no account, writing stays on the phone,
  tapping Begin agrees to the beta terms including anonymous counts, with "What's counted" expandable. Nothing is sent
  before that tap. This removes a whole terms screen from the first minute, but it bundles agreement into the
  main action, which is weaker consent than a separate checkbox. **This is a product choice, not legal advice;**
  confirm it meets Thailand's PDPA before relying on it. The counts can be turned off after the first routine.
- **Install moved off the core flow.** "Add to home screen" is a closed section on the completed screen. Our
  beta data suggests home-screen users were the only ones who returned, but that is correlation in a handful of
  devices, so it stays offered, never pushed.

## What was removed from the core flow, and what was kept

Removed from the screens: the five-step timeline and sky arc, the daily quote, the movement checklist, the
"one-job" app list, streaks, ratings, the note for tomorrow, the welcome and terms screens, the setup question, the
"phone first" QR screen for computers and the post-completion asks.

Kept on the phone, untouched: earlier intentions (`intent:` and `practice-intent:` keys, now listed by date),
the last note (shown, dated, in the same list), streak, setup answers, device id, stats choice, link source and
alarm time. Nothing is migrated destructively; "Delete everything on this phone" is still the only way to remove it.

## Reference concepts: what we kept and rejected

**"Brain Bootloader"** (a boot-sequence style routine)
- *Kept:* finite, visible progress ("Breath 1 of 3") and a clear end.
- *Rejected:* fake loading delays, "calibration" claims, percentages that don't measure anything, and any
  "Install Focus Shield" step. They imply a technical effect that doesn't exist and would add time for no reason.

**"Personal Oracle"** (notes that feel like messages from your past self)
- *Kept:* continuity through your own saved writing: today's intention on reopen, earlier ones by date.
- *Rejected:* making people breathe, install or allow notifications before they can see their own notes; blurred
  or locked content used as a trap; and any claims about dopamine, the Zeigarnik effect or what works for a
  particular demographic. None of that is supported for this product, and none of it appears in the app.

The app's wording stays plain: no psychology terms, no promises of focus or productivity.

## Evidence

- Requested reference: *Humanities and Social Sciences Communications* (Nature portfolio), 2025,
  <https://www.nature.com/articles/s41599-025-05000-w>. **I couldn't open this article from the build environment
  (network access to nature.com was blocked), so this document makes no claims about its findings.** Read it before
  citing it as support for any decision above.
- Everything else here comes from Mornward's own beta data (tiny samples) or general accessibility practice (WCAG 2.2
  contrast and target-size guidance). None of it shows that this design improves retention.

## How we'll know

1. Apply the migration, add your own devices to `excluded_devices`, and run the beta-4 app.
2. After about two weeks, read `routine_metrics`: counts and percentages for first-routine completion, next-day
   return, repeat core completion within 7 days and exact day-7 return, with the incomplete windows listed.
3. Don't compare these with the beta-3 `pass_rules` numbers: the definitions differ (see the audit).
4. Run a five-person test on real phones (at least two Android, two iPhone): first open, then the next morning.
   Watch for hesitation on Begin, the breathing pace, what people type, and whether they understood Finish.
