export const MORNING_ID = 700
export const EVENING_ID = 701

export interface ReminderNotification {
  id: number
  title: string
  body: string
  schedule: { on: { hour: number; minute: number }; repeats: true; allowWhileIdle: true }
  smallIcon: string
  extra: { open: 'morning' | 'evening' }
}

const at = (mins: number) => ({ on: { hour: Math.floor(mins / 60), minute: mins % 60 }, repeats: true as const, allowWhileIdle: true as const })

/** The two repeating daily triggers handed to the OS. `on` + `repeats` makes iOS register a repeating calendar trigger. */
export function buildReminders(morning: { mins: number; body: string }, evening: { mins: number }): ReminderNotification[] {
  return [
    { id: MORNING_ID, title: 'Before the feed.', body: morning.body, schedule: at(morning.mins), smallIcon: 'ic_stat_sun', extra: { open: 'morning' } },
    { id: EVENING_ID, title: 'Set up tonight.', body: 'Pick tomorrow’s tasks and leave yourself a line. It takes about a minute.', schedule: at(evening.mins), smallIcon: 'ic_stat_sun', extra: { open: 'evening' } },
  ]
}
