# Real-device checklist (beta-5)

The automated tests run in desktop Chromium with phone emulation. These checks need a real iPhone (Safari) and a real
Android phone (Chrome). Use a **test build** pointed at a dev Supabase project, or open the live site once with
`?test=1` so the rows are marked test. Write down the phone, OS version, date and result for each line. Until a line
passes, treat it as **unverified**.

## Routine and interruption (both phones)

- [ ] Begin, then lock the phone during breath 1 for 30 s. Unlock: it says **Paused**, still breath 1, and only
      Resume continues.
- [ ] Switch to another app mid-breath and back: same result.
- [ ] On the task screen, type a few words and tick a chip, then kill the browser. Reopen: the words and ticks are
      back.
- [ ] Skip breathing and skip tasks, then Finish. The strip shows a small mark (not a sun) and "0 of the last 7
      days".
- [ ] Next morning, do all three breaths and Keep these. Today shows a sun and "1 of the last 7 days".

## Home screen

- [ ] **iPhone:** after a routine, Add → follow the steps → open the icon. It opens full screen on Today with the
      same tasks? (Expected: the icon has separate storage, so it shows Begin. The anonymous ID under Privacy should
      match Safari's. Note which.)
- [ ] **Android:** tap Add → Chrome's dialog → Install. The box changes to "On your home screen". Open from the icon:
      no add box.
- [ ] **Android:** with Mornward installed, open mornward.app in Chrome. The add box doesn't appear
      (`getInstalledRelatedApps`).
- [ ] Both: turn on airplane mode and open from the icon. The app opens; Begin works.

## Reminders (delivery is unverified until these pass)

- [ ] **Android, Google Calendar:** set a time 3 minutes ahead → Add to Google Calendar → save. Check the event's
      notification setting (default vs "At time of event"). Note whether a notification appears at the time, and what
      opens when you tap it.
- [ ] **Android:** tap Add to Google Calendar twice. Note whether two events now exist.
- [ ] **iPhone, Apple Calendar:** Add to Apple Calendar. Safari should show Apple Calendar's add sheet, not a download.
      Note what it shows, then tap Add. Check the alert is "At time of event", and that an alert appears 3 minutes later.
- [ ] **iPhone:** tap Add to Apple Calendar again for the same time and add it. Note whether Calendar updates the event or adds a second one.
- [ ] **iPhone, the alert:** it reads "Open Mornward from your home screen"; the event has no link.
- [ ] **iPhone, Safari safety net:** after adding the icon (and tapping I've added it in Safari), open mornward.app in
      Safari: "Mornward lives on your home screen." The icon opens your own Mornward as usual.
- [ ] **iPhone, Copy link for Safari:** in the same Reddit setup, tap Copy link for Safari on Ready and paste it into
      Safari. Safari should show Ready with the same suggested tasks (typed ones stay behind).
- [ ] Both: delete the event. Nothing fires the next morning.

## Privacy and stats (with a dev Supabase project, or rows marked `?test=1`)

- [ ] Fresh install: before any tap on Welcome, nothing appears in `events` for this phone.
- [ ] Turn counts off on Welcome, then set up and do a routine: no new rows.
- [ ] In the dashboard, the phone's routine appears once in `routine_runs` after a reload mid-routine.

## Record results

| Check | Phone / OS | Date | Pass / fail / note |
| --- | --- | --- | --- |
| | | | |

## Setup (setup-first onboarding)

- [ ] **Both phones:** a fresh visit shows Welcome with the three icons. Prepare my morning → Save my plan → Make it
      easy to return → Continue → "Ready for your first morning." Kill the browser and reopen: "A minute before the scroll." appears with the
      prepared tasks. No breathing starts by itself.
- [ ] **Both phones:** next morning, Begin my morning → breaths → the prepared tasks are ticked. Save. The progress
      shows only today and "1 morning reset completed".
- [ ] **Both phones:** on "Make it easy to return.", the date picker opens and suggests tomorrow. Pick a later date;
      "First reminder: …" changes; the calendar event starts on that date at the local time shown.
- [ ] **Both phones:** open the calendar from setup, switch back to the browser (or let it reload): still on the
      same step, the date kept, the tasks prepared. "Ready" shows the date and "Check your calendar saved it", never that a reminder is set.
- [ ] **Both phones:** Skip for now on every optional part: setup still finishes, with no reminder line.
- [ ] **iPhone:** add to the home screen from "Make it easy to return.", then open the icon. It should open on the
      prepared screen without asking setup again (prepared tasks aren't carried).
- [ ] **VoiceOver (iPhone) and TalkBack (Android):** each step reads its heading, "Step n of 2" and each choice as
      a toggle button (selected / not selected). "More options" and "Personalize" read as expandable; the
      three icons read as "Three breaths, a few mini tasks, then you're ready".
- [ ] **Largest system text size (Dynamic Type / Android font size):** every setup screen is usable, and the
      bottom buttons don't cover the inputs.
- [ ] **Reduce Motion on (iOS) / Remove animations (Android):** Welcome, setup and the routine work.
- [ ] **A computer:** the page goes dark: the code, "Mornward only works where your bad habits live.", and the
      iPhone / Android steps. Nothing behind it can be clicked; Esc does nothing. Scanning the code opens mornward.app
      in the phone's browser, where the home-screen steps open.
- [ ] **QR arrival (both phones):** on a computer, scan the code on mornward.app. The phone opens Safari / Chrome on
      Welcome, with nothing on top. Tap Prepare my morning: the home-screen steps open instead of setup. Not now:
      back to Welcome. iPhone: Share → Add to Home Screen, then "I've added it": the sheet says to open it from the home
      screen; tap the icon: Welcome, setup works there. Android: "Add to home screen" opens Chrome's dialog; once added,
      Prepare my morning opens setup. "Can't find it?" → "Continue in this browser" lets setup run in that browser.
- [ ] **Reddit app (iPhone):** tap your post's link inside the Reddit app. Welcome shows; Prepare my morning opens the
      steps; "Can't find it?" says to open it in Safari, with Copy link.
- [ ] **Reminder repeats (both phones):** add the reminder once; check the event repeats every morning with no end
      date, and the alert fires at the time on the second morning too. Then Edit setup: it shows "Your calendar
      reminder", not the controls.
- [ ] **Added once (both phones):** add Mornward to the home screen, tap "I've added it" (iPhone), then open
      mornward.app in Safari / Chrome again: no "Add to home screen" box, row or steps anywhere. Android: open it once
      from the icon, then in Chrome: no box.

## Morning card

- [ ] Evening, after setup: Ready shows "Tomorrow's card" with the first question only.
- [ ] Next morning (Ready or Begin): "Today's card", the same question, "Unlocks when you finish your morning tasks".
- [ ] After the routine (Finish): still locked until every task is ticked; the last tick shows the answer, "That's all
      for today.", the source, and "Tomorrow's card: …".
- [ ] The morning after: the next question. A missed day doesn't skip a card.
