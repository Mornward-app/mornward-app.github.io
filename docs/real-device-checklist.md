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
- [ ] **iPhone, Apple Calendar:** Add to Apple Calendar. Note what Safari shows (a preview with "Add All", or a
      download). Add it. Check the alert is "At time of event", and that an alert appears 3 minutes later.
- [ ] **iPhone:** make the file again and add it. Note whether Calendar updates the event or adds a second one.
- [ ] **iPhone, Shortcut:** follow the four steps with the copied link. Set an alarm 2 minutes ahead and stop it.
      Note whether Mornward opens in Safari, and whether "Run Immediately" exists on this iOS version.
- [ ] Both: delete the event or automation. Nothing fires the next morning.

## Privacy and stats (with a dev Supabase project, or rows marked `?test=1`)

- [ ] Fresh install: before Begin, nothing appears in `events` for this phone.
- [ ] Turn counts off before Begin and do a routine: no new rows.
- [ ] In the dashboard, the phone's routine appears once in `routine_runs` after a reload mid-routine.

## Record results

| Check | Phone / OS | Date | Pass / fail / note |
| --- | --- | --- | --- |
| | | | |
