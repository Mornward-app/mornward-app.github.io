# Mornward

**Before the scroll, a few mini tasks.**

Mornward is a free one-minute routine for the moment your alarm goes off, before the feed gets there first.
Three breaths, then up to three small things for this morning. Then get on with your morning.

**Try it: [mornward.app](https://mornward.app)**. Free, no account. Currently in beta.

## How it works

**First visit: prepare now, practise in the morning.** Welcome ("A calmer start, before the scroll.", with an
optional folded preview) → mini tasks for your first morning ("Save my morning plan", or choose in the morning) →
"Make it easy to return." (a calendar reminder and the home screen, both optional) → "Ready for your first morning."
Where your scroll starts is an optional, folded "Personalize your morning invitation". On a computer, the phone is
offered first ("Set up where you’ll use it."). Setup starts no routine. Already up? "Begin now" goes straight to the
routine. Details: [`docs/onboarding.md`](docs/onboarding.md).

**Each morning:**

| Screen | What happens |
| --- | --- |
| Begin | One button: 3 breaths → mini tasks → ready. About one minute. (Before the first routine: "A minute before the scroll.") |
| Breathe | Three slow breaths (4 seconds in, 6 out), with Pause and Skip |
| Choose | "What matters this morning?" Ten mini tasks (a fresh ten each routine day), two ticked: change them or add your own (up to three), then Save my tasks |
| Done | "Morning reset complete." The sun rises; your mini tasks (with Edit) and your progress |

Open it again the same day and you see today's mini task. The next day it offers the routine again;
earlier tasks stay on your phone, listed by date. A calendar reminder is optional, in setup and under Today. It never asks for notification permission.
Light and dark: it follows your phone, or pick one under Appearance.
Begin and Today show an "Add to home screen" box (Chrome's one-tap install on Android, Apple's
Share steps on iPhone) and "Your progress": your dates since you started (the last 7 once there are more), a yellow circle
for each full morning reset (3 breaths and mini tasks), and a running count of resets completed.

Design reasoning: [`docs/mornward-ui-ux-rationale.md`](docs/mornward-ui-ux-rationale.md).

## Privacy

- No account, no sign-up.
- Everything you write stays on your phone.
- During the beta it sends a few counts (like whether you finished the routine, never what you wrote), linked only by a random ID, so we can tell whether it's working. You can turn this off before you begin, or under "Privacy and your data" after any routine.

Details: [terms and privacy](https://mornward.app/terms.html). Questions: mornward@proton.me

## For developers

One self-contained `index.html`, with no framework and no build step, hosted on GitHub Pages.
Your mini tasks are stored in `localStorage`. The optional stats go to Supabase; see `supabase/ANALYTICS.md` and
`supabase/METRICS.md` (definitions). Tests: `tests/README.md`.
