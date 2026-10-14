export const MORNING_ID = 700
export const EVENING_ID = 701

/**
 * The morning chime. The iOS default notification sound plays until a file is added:
 *  1. drop chime.wav into Xcode (App target, Copy Bundle Resources)
 *  2. set CHIME_READY to true
 * The key stays out of the notification until then, so nothing depends on how iOS treats a missing file.
 */
export const CHIME_FILE = 'chime.wav'
export const CHIME_READY = false

export interface ReminderNotification {
  id: number
  title: string
  body: string
  schedule: { on: { hour: number; minute: number }; repeats: true; allowWhileIdle: true }
  smallIcon: string
  extra: { open: 'morning' | 'evening' }
  sound?: string
}

const at = (mins: number) => ({ on: { hour: Math.floor(mins / 60), minute: mins % 60 }, repeats: true as const, allowWhileIdle: true as const })

/** The two repeating daily triggers handed to the OS. `on` + `repeats` makes iOS register a repeating calendar trigger. */
export function buildReminders(morning: { mins: number; body: string }, evening: { mins: number }, chimeReady: boolean = CHIME_READY): ReminderNotification[] {
  return [
    { id: MORNING_ID, title: 'Before the feed.', body: morning.body, schedule: at(morning.mins), smallIcon: 'ic_stat_sun', extra: { open: 'morning' }, ...(chimeReady ? { sound: CHIME_FILE } : {}) },
    { id: EVENING_ID, title: 'Set up tonight.', body: 'Pick tomorrow’s tasks and leave yourself a line. It takes about a minute.', schedule: at(evening.mins), smallIcon: 'ic_stat_sun', extra: { open: 'evening' } },
  ]
}
