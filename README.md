# Mornward

**Before the scroll, one clear intention.**

Mornward is a free one-minute routine for the moment your alarm goes off, before the feed gets there first.
Three breaths, then choose one small thing that matters this morning. Then get on with your morning.

**Try it: [mornward.app](https://mornward.app)**. Free, no account. Currently in beta.

## How it works

| Screen | What happens |
| --- | --- |
| Begin | One button. About one minute. |
| Breathe | Three slow breaths (4 seconds in, 6 out), with Pause and Skip |
| Choose | "What matters this morning?" One small intention, or skip for today |
| Finish | "You're ready." Your intention, with Edit |

Open it again the same day and you see today's intention. The next day it offers the routine again;
earlier intentions stay on your phone, listed by date. Adding it to your home screen and a calendar reminder
are optional, on the screen after you finish. It never asks for notification permission.

Design reasoning: [`docs/mornward-ui-ux-rationale.md`](docs/mornward-ui-ux-rationale.md).

## Privacy

- No account, no sign-up.
- Everything you write stays on your phone.
- During the beta it sends a few anonymous counts (like whether you finished the routine, never what you wrote) so we can tell whether it's working. You can turn this off under "Privacy and your data" after any routine.

Details: [terms and privacy](https://mornward.app/terms.html). Questions: mornward@proton.me

## For developers

One self-contained `index.html`, with no framework and no build step, hosted on GitHub Pages.
Your intentions are stored in `localStorage`. The optional anonymous stats go to Supabase; see `supabase/ANALYTICS.md`.
