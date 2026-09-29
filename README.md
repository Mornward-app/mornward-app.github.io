# Mornward

**Your first 5 minutes go to someone. Make it you.**

Mornward is a free 5-minute morning routine you open right after your alarm, before the feed gets there first.
Breathe, read one short quote, get out of bed, and plan your day. Then it ends.

No lock. No lecture. Just a better first move.

**Try it: [mornward.app](https://mornward.app)**. Free, no account, lives on your home screen. Currently in beta.

## How it works

**Once (about 2 minutes):** add Mornward to your home screen, answer 3 quick questions, and tell it when your alarm goes off.

**Every morning (about 5 minutes):**

| Step | What happens |
| --- | --- |
| Wake | A short greeting, your streak, and the note you left yourself last night |
| Breathe | Five slow breaths, about 50 seconds (skippable) |
| Read | One short quote from someone who's been there |
| Move | Pick 2 of 3 small moves that get you out of bed |
| Plan | One thing that would make today count |
| Done | "The sun is up." Your streak, 0 posts seen, and a note for tomorrow |

It doesn't block any apps. If you need one for something useful, like messages, maps or email,
the last screen opens it straight to that part, after a short wait.

## Privacy

- No account, no sign-up.
- Everything you write stays on your phone.
- During the beta it sends a few anonymous counts (like whether you finished your morning) so we can tell whether it's working. You can turn this off at the end of any morning.

Details: [terms and privacy](https://mornward.app/terms.html). Questions: mornward@proton.me

## For developers

One self-contained `index.html`, with no framework and no build step, hosted on GitHub Pages.
Your routine is stored in `localStorage`. The optional anonymous stats go to Supabase; see `supabase/ANALYTICS.md`.
