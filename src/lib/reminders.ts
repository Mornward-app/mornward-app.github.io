import { getState } from './store'
import { notifBody } from './copy'
import { scheduleReminders, type PushResult } from './native'

/**
 * Register the morning and evening reminders with the OS from the saved state.
 * `ask` is true only from the toggle tap; background re-syncs never show a permission prompt.
 */
export function syncReminders(ask: boolean): Promise<PushResult> {
  const s = getState()
  return scheduleReminders({ mins: s.wakeMins, body: notifBody(s.picked) }, { mins: s.eveningMins }, ask)
}
