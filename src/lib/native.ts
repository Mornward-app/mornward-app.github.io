import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { App } from '@capacitor/app'
import { actions, checkDay } from './store'

export const isNative = () => Capacitor.isNativePlatform()

/** Haptics: light on tick / breath / chip, medium on pact stamp and card shake, success when the plan is set. */
export type Haptic = 'light' | 'medium' | 'success'
export function haptic(kind: Haptic = 'light') {
  try {
    if (kind === 'success') void Haptics.notification({ type: NotificationType.Success })
    else void Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light })
  } catch { /* no haptics here */ }
}

const NOTIFICATION_ID = 700

export type PushResult = 'scheduled' | 'denied' | 'unsupported'

/** One daily LOCAL notification at the wake time. Permission is asked only from the toggle tap. Nothing leaves the phone. */
export async function enableMorningPush(hour: number, minute: number, body: string): Promise<PushResult> {
  try {
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return 'denied'
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] })
    await LocalNotifications.schedule({
      notifications: [{
        id: NOTIFICATION_ID,
        title: 'Before the feed.',
        body,
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        smallIcon: 'ic_stat_sun',
        extra: { open: 'wake' },
      }],
    })
    return 'scheduled'
  } catch {
    return 'unsupported'
  }
}

export async function disableMorningPush() {
  try { await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] }) } catch { /* nothing scheduled */ }
}

/** Android: put the phone down by sending the app to the background. iOS and web cannot, so the caller dims the screen. */
export async function putPhoneDown(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false
  try { await App.minimizeApp(); return true } catch { return false }
}

/** Notification tap opens the Wake screen. */
export function initNative() {
  if (!isNative()) return
  void LocalNotifications.addListener('localNotificationActionPerformed', () => actions.openFromNotification())
  void App.addListener('appStateChange', ({ isActive }) => { if (isActive) checkDay() })
}
