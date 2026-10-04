# Mornward

**Before the scroll, one mini task.**

Mornward is a free one-minute routine for the moment your alarm goes off, before the feed gets there first.
Three breaths, then one small thing for this morning. Then get on with your morning.

**Try it: [mornward.app](https://mornward.app)**. Free, no account. Currently in beta.

## How it works

| Screen | What happens |
| --- | --- |
| Begin | One button: 3 breaths → 1 mini task → ready. About one minute. |
| Breathe | Three slow breaths (4 seconds in, 6 out), with Pause and Skip |
| Choose | "What matters this morning?" Write a mini task, or pick one of twelve (your own recent ones first), or skip |
| Finish | "You're ready." The sun rises; your mini task, with Edit |

Open it again the same day and you see today's mini task. The next day it offers the routine again;
earlier tasks stay on your phone, listed by date. A calendar reminder is optional, on the screen after you finish. It never asks for notification permission.
Light and dark: it follows your phone, or pick one under Appearance.
Begin and the screen after Finish show an "Add to home screen" box (Chrome's one-tap install on Android, Apple's
Share steps on iPhone) and a week strip: each morning you did it is a sun, and tomorrow waits as an outline.

Design reasoning: [`docs/mornward-ui-ux-rationale.md`](docs/mornward-ui-ux-rationale.md).

## Privacy

- No account, no sign-up.
- Everything you write stays on your phone.
- During the beta it sends a few anonymous counts (like whether you finished the routine, never what you wrote) so we can tell whether it's working. You can turn this off under "Privacy and your data" after any routine.

Details: [terms and privacy](https://mornward.app/terms.html). Questions: mornward@proton.me

## For developers

One self-contained `index.html`, with no framework and no build step, hosted on GitHub Pages.
Your mini tasks are stored in `localStorage`. The optional anonymous stats go to Supabase; see `supabase/ANALYTICS.md`.
