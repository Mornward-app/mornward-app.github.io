import { Preferences } from '@capacitor/preferences'

/**
 * Durable state: every write goes to BOTH
 *  - @capacitor/preferences (UserDefaults on iOS: lives on the device disk, survives iOS closing the app), and
 *  - localStorage (synchronous fallback; on the web it is the only durable copy).
 * WKWebView may purge localStorage under storage pressure, which is what lost data overnight before.
 * On launch the caller reads both and keeps the newer one (see hydrate in store.ts).
 */
export async function readBoth(key: string): Promise<{ pref: string | null; local: string | null }> {
  let pref: string | null = null
  let local: string | null = null
  try { pref = (await Preferences.get({ key })).value } catch { /* plugin unavailable */ }
  try { local = localStorage.getItem(key) } catch { /* storage blocked */ }
  return { pref, local }
}

/** Keys an earlier beta used for the anonymous counts. Removed on launch so no device ID is left behind. */
export const LEGACY_KEYS = ['mornward.stats.v1']

export async function purgeLegacyKeys() {
  for (const key of LEGACY_KEYS) {
    try { localStorage.removeItem(key) } catch { /* storage blocked */ }
    try { await Preferences.remove({ key }) } catch { /* plugin unavailable */ }
  }
}

const latest = new Map<string, string>()
let running = false
let idle: Array<() => void> = []

function pump() {
  if (running) return
  const next = latest.entries().next()
  if (next.done) { const w = idle; idle = []; w.forEach((r) => r()); return }
  const [key, value] = next.value
  latest.delete(key)
  running = true
  Preferences.set({ key, value }).catch(() => undefined).finally(() => { running = false; pump() })
}

/** localStorage is written synchronously; Preferences writes are coalesced to the newest value and sent in order. */
export function writeBoth(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage full or blocked: Preferences still has it */ }
  latest.set(key, value)
  pump()
}

/** Resolves when every queued write has reached the device. */
export const flushWrites = () => new Promise<void>((resolve) => { if (!running && latest.size === 0) resolve(); else idle.push(resolve) })

/** Web only: ask the browser not to evict our storage. Harmless on native. */
export async function requestPersistentStorage() {
  try { await navigator.storage?.persist?.() } catch { /* not supported */ }
}
