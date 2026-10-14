import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { App } from '@capacitor/app'
import { actions, checkDay } from './store'
import { flushWrites } from './storage'

export const isNative = () => Capacitor.isNativePlatform()

/** Haptics: light on tick / breath / chip, medium on pact stamp and card shake, success when the plan is set. */
export type Haptic = 'light' | 'medium' | 'success'
export function haptic(kind: Haptic = 'light') {
  try {
    if (kind === 'success') void Haptics.notification({ type: NotificationType.Success })
    else void Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light })
  } catch { /* no haptics here */ }
}

import { buildReminders, EVENING_ID, MORNING_ID } from './reminder-payload'

export type PushResult = 'scheduled' | 'denied' | 'unsupported'

/**
 * Two repeating daily LOCAL notifications, scheduled with the OS (UNCalendarNotificationTrigger on iOS), so they
 * appear on the Lock Screen at the exact minute even when the app is closed. Nothing is sent at set-up time:
 * the permission is asked, the triggers are registered, and the OS fires them later. Nothing about them leaves the phone.
 */
export async function scheduleReminders(morning: { mins: number; body: string }, evening: { mins: number }, ask = true): Promise<PushResult> {
  try {
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted' && ask) perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return 'denied'
    await LocalNotifications.cancel({ notifications: [{ id: MORNING_ID }, { id: EVENING_ID }] })
    await LocalNotifications.schedule({ notifications: buildReminders(morning, evening) })
    if (isNative()) {
      // confirm the OS really holds both triggers before the app says "alarm set"
      const { notifications } = await LocalNotifications.getPending()
      const ids = notifications.map((n) => n.id)
      if (!ids.includes(MORNING_ID) || !ids.includes(EVENING_ID)) return 'unsupported'
    }
    return 'scheduled'
  } catch {
    return 'unsupported'
  }
}

export type PermState = 'granted' | 'denied' | 'prompt'

/** Where notification permission stands, without asking. 'prompt' means iOS has never asked: it can only ask once, so we explain first. */
export async function getPermissionState(): Promise<PermState> {
  try {
    const p = await LocalNotifications.checkPermissions()
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt'
  } catch { return 'prompt' }
}

/** iOS: the app's page in Settings, where a refused permission can be turned back on. */
export async function openSystemSettings() {
  // Capacitor hands non-web URL schemes to iOS, so this opens the app's page in Settings. Nothing happens on the web.
  if (!isNative()) return
  try { window.location.assign('app-settings:') } catch { /* cannot open Settings */ }
}

export async function cancelReminders() {
  try { await LocalNotifications.cancel({ notifications: [{ id: MORNING_ID }, { id: EVENING_ID }] }) } catch { /* nothing scheduled */ }
}

/** Android: put the phone down by sending the app to the background. iOS and web cannot, so the caller dims the screen. */
export async function putPhoneDown(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false
  try { await App.minimizeApp(); return true } catch { return false }
}

/** Notification tap: morning opens Wake, evening opens Evening Setup. Backgrounding flushes saved state to disk. */
export function initNative() {
  if (!isNative()) return
  void LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    actions.openFromNotification(e.notification.extra?.open === 'evening' ? 'evening' : 'morning')
  })
  void App.addListener('appStateChange', ({ isActive }) => { if (isActive) checkDay(); else void flushWrites() })
  void App.addListener('backButton', () => { void App.minimizeApp() })
}
