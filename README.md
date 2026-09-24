# First Light

A "bridge app" to open the moment you wake up, in place of Instagram, Reddit or YouTube.
It gives your hands something to do with the phone, but everything in it ends. There is no feed.

Open `index.html` in a phone browser, or the live version on GitHub Pages. It is one self-contained file with no build step.

## The sequence (about 5 minutes)

| Step | What happens | Why |
| --- | --- | --- |
| Wake | Greeting, streak count | Rewards opening this instead of the feed |
| Breathe | 5 guided breaths (4 s in, 6 s out). Skippable | Adds friction, like One Sec's pause, but does something useful with it |
| Read | One public-domain passage (Marcus Aurelius, Seneca, Thoreau) plus a question. Changes daily | Replaces the scroll with reading that ends |
| Move | Check off 3 physical steps (feet on floor, water, curtains). You can edit them | Gets you out of bed, where the scrolling happens |
| Plan | Shows the note you left last night, then asks for one intention for today | Your own words, in place of an algorithm |
| Done | Time spent, streak, "0 posts seen", and a box for tomorrow's note | Clear stopping point |

**Utility doors.** The last screen has a collapsed section, "I need an app for one specific job".
It unlocks after 10 seconds and links straight to the useful parts of each app:

- Instagram → `instagram.com/direct/inbox/` (messages, not Reels)
- YouTube → a search results page for what you typed (not the home feed or Shorts tab)
- Reddit → search results for what you typed (not the front page)

This is a rough version of the "surgical blocking" gap: you keep the utility and skip the feed at the entry point.
It can't strip Reels or Shorts once you're inside. That needs OS-level work (see below).

Everything is stored in `localStorage` on the device. Nothing leaves the phone.

## Wiring it into the morning

The app only helps if it's what your thumb finds first.

**iPhone**
1. Open the page in Safari → Share → *Add to Home Screen*.
2. Put that icon exactly where Instagram used to be. Move Instagram, Reddit and YouTube into a folder on page 2.
3. Shortcuts → Automation → *Alarm* → *Is Stopped* → action *Open URLs* (the page URL) → turn off *Ask Before Running*.
   Now stopping your alarm opens First Light.
4. Optional: Screen Time → App Limits → 1 minute for Social before 9:00.

**Android**
1. Chrome → ⋮ → *Add to Home screen*, and put it in the old Instagram slot.
2. Modes and Routines (Samsung), Google Clock's *Routines*, or Tasker: when the alarm is dismissed → open the URL.
3. Digital Wellbeing → Bedtime mode keeps the screen grayscale until your wake time, which makes feeds less appealing.

## Where this could go as a real product

- **Native app with OS-level control.** iOS Screen Time API (`FamilyControls` / `ManagedSettings`) can shield
  Instagram/Reddit/YouTube until the morning run is done, then unlock automatically. Android can do the same with
  an AccessibilityService, which is also the only way to hide Reels/Shorts inside the apps (as some Android tools already do).
- **Finite RSS.** A reader that pulls a fixed list of feeds overnight and shows "You're caught up" after N items.
  Needs a small server or a native app because browsers block cross-site RSS fetches.
- **Pricing.** Following Opal and One Sec: free core loop, paid tier for OS-level locking and RSS, no ads.
