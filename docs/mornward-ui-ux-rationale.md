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
- **Install off the routine itself.** Adding to the home screen never interrupts Breathe, Choose or Finish. (Pass 3
  makes it a visible box on Begin and Today; see below.)

## Visual pass 2: fewer words, more taps, more to see

| Decision | Mechanism | Uncertainty | Risk to the person | Validation |
| --- | --- | --- | --- | --- |
| **Pictures instead of explanation**: Begin shows "3 breaths → 1 intention → Ready" as three icons; "At your own pace", "Choose one small thing." and "Take it into your day." are gone | Less to read when half awake; the minute's shape is visible at a glance. | Some people may miss the reassurance the removed lines gave. | Low. Every step still has its words for screen readers. | Five-person test: can people say what will happen before tapping Begin? |
| **Visible progress**: three bars at the top of Breathe and Choose; three dots for the breaths (done, current) | You can see how far you are without reading a number. | Bars may look like a loading indicator. | None. The dots follow real breaths, and the bars real steps; nothing is faked. | Tests check dots against the breath count. |
| **Tap the circle to pause**; a short buzz at each in/out change (Android) | A big target for a sleepy thumb; the buzz lets people breathe with their eyes closed. | Unknown whether people find the circle tap; the Pause button stays. The buzz may annoy some people. iPhones ignore it. | Low. The buzz is 12 ms and only during breathing. | Ask in the user test; if people dislike the buzz, add a switch. |
| **One-tap ideas** under Save: your own last two intentions ("Use again") and four small starters | Typing at 7 am is effort; a tap plus Save is two taps. Your own words come first, so it stays personal. | Starters may make intentions generic. | Low. Tapping only fills the field; nothing is saved until Save, and yesterday's text is never filled in on its own. | Compare saved vs skipped intentions before and after; ask whether the ideas felt pushy. |
| **The sun rises on Finish** (1.4 s, none with reduced motion) | One small moment of completion instead of words or a score. | It could feel childish to some. | None. | User test reactions. |
| **Dark mode**: follows the phone (Auto), or Light/Dark under Appearance; in dark, the sun colour becomes the button | A bright screen at 6 am in a dark room is unpleasant; the one action stays the brightest thing on screen. | Dark colours were chosen by contrast ratio, not tested with people. | None known. | Contrast: text 15.0:1, secondary text 8.7:1, button text 11.3:1, field edge 4.6:1, chip edge 3.2:1. |
| **The idea chips sit below Save** and never hide | An earlier version hid them while typing; that moved Save as the keyboard closed, so a tap meant for Save could land on an idea and replace the words. Caught by the tests before release. | None. | Avoided. | Covered in `qa/redesign/v2.js`. |

## Pass 3: installs and coming back on day 2

The founder set the goal for this pass: more people adding Mornward to the home screen, and coming back on day 2 and
after. Two earlier decisions change because of it, and the reasons are recorded here.

| Decision | Mechanism | Uncertainty | Risk to the person | Validation |
| --- | --- | --- | --- | --- |
| **A visible "Add to home screen" box** at the bottom of Begin and Today (it replaces the closed section). Android Chrome: Chrome's own one-tap dialog when Chrome offers it, menu steps otherwise. iPhone: Apple's steps as numbered pictures (iOS 26: ⋯ → Share → Add to Home Screen; older: Share → Add to Home Screen → Add). Inside Reddit or Instagram: open in the browser first. | An icon on the home screen is the reminder that's there every morning. Beta data: the only people who came back had the icon (3 devices, correlation only). | Whether the box raises installs, and whether installing causes returns, is unknown. | Low. It's never shown during Breathe, Choose or Finish, never asks for permissions, says "Added" only when Chrome confirms it, and "Not now" hides it until tomorrow. | `routine_metrics.used_home_screen`, `install_confirmed`; compare next-day return for devices with and without the icon (still correlation). |
| **Install rules followed, and checked with Chrome itself.** HTTPS, a manifest with name, icons 192/512 plus a separate maskable icon, standalone display, start address and scope, a service worker, and screenshots for Chrome's richer install sheet. iPhone: a 180 px apple-touch-icon and the web-app tags. | Chrome only offers its install dialog to sites that meet its criteria. | Chrome decides when to offer it (engagement heuristics), so the box falls back to the menu steps. | None. | Chrome's own check (`Page.getInstallabilityErrors`) returns no errors. Real-device check still needed. |
| **A week strip instead of a streak** (this reverses "no streaks"): the last six days and tomorrow. Done days are suns, tomorrow is a dashed outline, and the line reads "2 mornings this week · see you tomorrow". | Shows that this is a daily thing and that tomorrow is the next step, which a clean ending alone didn't say. | It may still feel like a streak to some people. | Kept gentle on purpose: it counts mornings, never "in a row", and missing a day shows only an empty circle. No "streak lost", no numbers on Finish. | Next-day and day-7 return in `routine_metrics`. Ask in the user test whether it felt motivating or like pressure. |
| **The new icon** matches the app: a sun rising over a horizon in the app's colours. | It's the thing people see each morning, so it should look like what they used. | None. | None. | Look at it on a real home screen next to other apps. |
| **Carried IDs only via the icon or the calendar link.** The iPhone box writes the anonymous ID into the address so the icon isn't counted as a new person; a copied address opened by someone else is now ignored. | Keeps one person, one ID. | None. | Removes a mix-up between people sharing a link. | Covered by `qa/redesign/extras.js`. |

### Pass 3b: a smaller box, a smoother add

- **One row instead of a card.** Icon, "Add to home screen", "One tap tomorrow, no feed first.", an **Add** button and a
  corner ✕ (Not now). About 70–80 px tall on most phones (it was about 330 px).
- **Add does the most the browser allows.** Android with Chrome's offer: Chrome's own install dialog (two taps). iPhone,
  or Android before Chrome offers: a sheet with the three steps as pictures and an arrow toward the browser button to
  tap (iOS 26: ⋯ at the bottom right; older iOS: Share in the bottom bar; Android Chrome: ⋮ at the top). Arrow
  positions are approximate, because browsers move their buttons. Esc, Done or tapping outside closes it.
- **Why the home screen** (one line in the sheet): "It opens straight to Mornward, full screen, even offline."
- **iPhone carry-over runs only when Add is tapped**, after agreeing, instead of whenever the box appears.

### Pass 3c: changes from a design review

| Review point | Change |
| --- | --- |
| Begin also asked people to install | The box appears only after the first routine is finished. The ✕ is a real "no": the box doesn't come back, and a closed "Add to home screen" row stays under Today for later. It disappears once installed or opened from the icon. |
| Counts could only be turned off after the first routine | Begin now says "Anonymous usage counts are on. Turn off", before anything is sent. |
| Two progress systems on Breathe | The step bars are gone (from Choose too). Breathe shows the dots with "Breath 1 of 3" written next to them. |
| Ideas sat below Save | Order is now field → ideas → Save. The ideas are one row you can swipe, so Save moves only about 50 px and stays above an iPhone keyboard. Tapping an idea only fills the field. |
| "3 taps" and arrows at browser buttons | Removed. The title is "Add Mornward to your home screen", every set of steps ends with the confirmation (for example "Tap Add"), and there are no arrows. The steps still need checking on real browsers. |

### Pass 4: "mini task", a list of mini tasks, a hidden Test drive panel

- **"Intention" became "mini task"** in everything people see ("Before the scroll, one mini task.", "My mini task",
  "Save my task", "Earlier tasks"). "Intention" felt heavy for "Make my bed". Internal names (`intention_saved`,
  `intent:` keys) are unchanged, so stored data and stats carry on.
- **Twelve mini tasks as a vertical list** (your own last two first, marked "Use again"). Save and Skip stay pinned to
  the bottom while you scroll. While typing, the list folds away so Save sits under the field above the keyboard;
  it returns 0.45 s after typing ends, so a tap on Save lands before anything moves.
- **Preview tools are a slim "Test drive" tab** that slides up a panel (Next day, Back to today, Theme, Steps, Start
  fresh). Preview build only.

### Pass 5: pick a few mini tasks (chips, two pre-ticked)

- **Chips instead of a list**, like a tag picker: ten short labels ("Water first", "Make my bed", "Plan my top 3"…),
  two or three per row. Never more than ten on screen: your own past tasks take the place of starters. Ticked chips show a check and an amber outline.
- **Two come pre-ticked**, a different pair each day. The button reads **Keep these** while they're untouched (one tap
  to finish) and **Save my tasks** once anything changes. Up to three in total, including "Add your own".
- **Your own past tasks** appear as extra chips marked ↺, never ticked for you, so yesterday's choice isn't presented
  as today's.
- **Headline:** "Before the scroll, a few mini tasks." (two ticked contradicted "one").
- **Measurement risk, handled:** pre-ticked options inflate whatever is ticked. `intention_saved` now carries
  `kept_defaults` (the pair saved unchanged), `count` and `own`, so "kept the suggestion" can be told apart from a real
  choice. Which tasks were picked is not sent.
- **Uncertainty:** defaults may make the routine feel less personal, or more effortless. Compare `kept_defaults`
  with next-day return once there's data.

### Pass 6: mini tasks that don't repeat

- **A curated bank of 39 mini tasks in seven themes** (body, food, outside, focus, home, people, calm), kept in the app
  and never mentioned on screen. Each routine day shows ten, with the themes mixed, so two neighbouring chips are
  from different themes and the two pre-ticked ones are too.
- **The set moves on per routine day**, not per calendar day: day 2's ten share nothing with day 1's, a reopen the same
  day shows the same ten, and a skipped week doesn't skip choices. Four routine days cover the whole bank; the next
  pass is reshuffled.
- **Each phone has its own shuffle** from a random number kept on the phone (`fl.taskSeed`), never sent.
- **"Healthy breakfast"** and other food tasks are in the bank (the founder asked for a meal option).
- Checked by `qa/redesign/rotate.js` (no overlap day 1→2 and 2→3, all 39 seen in four days, stable within a day,
  nothing sent).

### Pass 7: from a computer to the phone; which phone the steps are for

People who find the link on a computer (ads, posts) won't open a laptop first thing in the morning, so the computer
visit has to end on the phone. Options weighed:

| Option | For | Against | Decision |
| --- | --- | --- | --- |
| Block computers ("use your phone") | Clear | Hostile; loses curious visitors | No |
| Email or text yourself the link | Familiar | Typing an address is friction | Not on its own |
| **QR code: point your phone's camera** | One action, no typing; the pattern Apple uses on apple.com ("scan with your iPhone") | Needs a phone nearby, which is usually true | **Primary** |
| **Send to my phone** (the computer's share menu: AirDrop, Nearby Share, Messages) | One tap on a Mac with an iPhone | Not every computer has it | Secondary; shown only where it works |
| Copy link | Works everywhere | More steps | Quiet fallback |
| Let them use it on the computer | No dead end | Doesn't build the morning habit | Still allowed; Begin is never blocked |

Applied the Apple way: one obvious action (scan), a card that never blocks the routine (beside the app on wide
screens, below it on narrow ones), secondary options quiet, and plain words ("Take it to your phone"). The code opens
`mornward.app/?from=qr`, so `from: qr` on a phone's first routine counts these hand-offs. The computer never shows the
phone install box, because it would ask for something a computer can't do.

The add-to-home-screen guide now says which phone it's for: an **iPhone | Android** switch, set from the browser, with
the browser named under it ("On iPhone, in Safari", "On Android, in Samsung Internet"; inside Instagram: "Open this
page in Safari first, then:"). Checked in `qa/redesign/handoff.js`, which reads the QR code back from a screenshot.

### Pass 8: a morning reminder that works on iPhone too

Android already had Google Calendar (an event that pops up at the chosen time). For iPhone, the options were:

| Option | How | Trade-off | Decision |
| --- | --- | --- | --- |
| **Apple Calendar alert** | A calendar file made on the phone, with an alert, for 7 mornings | Same as Google Calendar; a time, not the alarm itself | **Yes, the default on iPhone** |
| **Shortcuts: "when my alarm stops, open Mornward"** | Apple's Shortcuts app: Automation, Alarm, Is Stopped, Run Immediately, Open URLs | Fits the product best (Mornward appears the moment the alarm is off); a website can't create it, so it's about six taps by hand. It opens in Safari, which on iPhone keeps a separate history from the home-screen icon | **Yes, as "Better: …"**, with picture steps, Copy Mornward link, Open Shortcuts |
| Web push notifications | iOS 16.4+ allows them for home-screen web apps | Needs a server to send them on schedule and a permission prompt; a backend project | **Later**; noted, not built |

The section is now **Morning reminder**, with the same iPhone | Android switch as the add guide, preset from the
browser. The copied Shortcut link is `mornward.app/?via=alarm#r=…` (anonymous ID after `#`), so routines opened by the
alarm show `via: "alarm"`. Nothing is counted when someone sets a reminder, because it can't be confirmed. Checked in
`qa/redesign/reminder.js`. **Not tried on a real iPhone:** the Shortcuts steps can differ a little by iOS version.

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
