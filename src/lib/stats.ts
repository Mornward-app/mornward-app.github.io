import { Capacitor } from '@capacitor/core'
import { dateKey } from './dates'
import { readBoth, writeBoth } from './storage'

/**
 * Anonymous, privacy-first counts (Supabase). Ported from the beta-5 web app (PR #36):
 * insert-only rows to one table, a random device ID, numbers and yes/no flags only. Never the tasks, the pact,
 * the wake time or anything a person writes. Nothing is sent before the person agrees (the first tap on
 * "Begin tonight's setup", or OK on the one-time notice for people who set up before counts existed), and
 * nothing at all once they turn the counts off. Keep the list in step with public/terms.html.
 *
 * The publishable key is meant to be public: the database only lets it ADD rows that pass its payload check
 * (supabase/migrations/20261011000000_daybreak_counts.sql), dated within two days of today.
 */
export const STATS = {
  url: 'https://cnwwyucolebrcbydbfej.supabase.co/rest/v1/events',
  key: 'sb_publishable_XpdHaGbjKX5CC0LRYiWBxQ_O8xO2oCs',
  version: 'daybreak-1',
}
export const CONTACT = 'mornward@proton.me'
export const TERMS_URL = 'https://mornward.app/terms.html'
/** Bump when the counted list changes in a way people should agree to again. */
export const TERMS_VERSION = 'beta-5'
export const STATS_KEY = 'mornward.stats.v1'

export type Kind =
  | 'app_opened' | 'evening_set' | 'sun_hold_done' | 'breaths_skipped' | 'morning_completed' | 'card_opened' | 'history_synced'
type Value = number | boolean | string | string[] | null
export interface Row {
  event_id: string
  device_id: string
  day: string
  kind: Kind
  data: Record<string, Value>
  app_version: string
}
interface StatsState {
  deviceId: string | null
  agreed: { version: string; on: string; how: string } | null
  noStats: boolean
  /** the person's own test phones: open mornward.app/?test=1 once (?test=0 undoes it) */
  test: boolean
  /** keys of rows already queued, so each step is counted once however often a screen redraws */
  sent: string[]
  outbox: Row[]
  /** the one-time catch-up for mornings finished before counts existed */
  backfilled: boolean
}

const blank = (): StatsState => ({ deviceId: null, agreed: null, noStats: false, test: false, sent: [], outbox: [], backfilled: false })
let st: StatsState = blank()
let ready = false
const listeners = new Set<() => void>()

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const uuid = (): string => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)))

function parseStats(raw: string | null): StatsState | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as Partial<StatsState>
    const s = blank()
    if (typeof p.deviceId === 'string' && UUID.test(p.deviceId)) s.deviceId = p.deviceId
    if (p.agreed && typeof p.agreed === 'object' && typeof p.agreed.version === 'string') s.agreed = p.agreed
    s.noStats = p.noStats === true
    s.test = p.test === true
    if (Array.isArray(p.sent)) s.sent = p.sent.filter((k) => typeof k === 'string').slice(-80)
    if (Array.isArray(p.outbox)) s.outbox = p.outbox.filter((r) => r && typeof r === 'object' && UUID.test(r.event_id)).slice(-50)
    s.backfilled = p.backfilled === true
    return s
  } catch { return null }
}
function save(patch: Partial<StatsState>) {
  st = { ...st, ...patch }
  if (ready) writeBoth(STATS_KEY, JSON.stringify(st))
  listeners.forEach((l) => l())
}

/** Read the saved counts state (both stores; the copy with more rows queued or agreed wins). Before the first render. */
export async function hydrateStats() {
  const { pref, local } = await readBoth(STATS_KEY)
  const a = parseStats(pref)
  const b = parseStats(local)
  const score = (s: StatsState | null) => (s ? (s.agreed ? 2 : 0) + (s.noStats ? 1 : 0) + s.sent.length / 1000 : -1)
  st = (score(a) >= score(b) ? a : b) ?? blank()
  try {
    const t = new URLSearchParams(location.search).get('test')
    if (t === '1') st.test = true
    if (t === '0') st.test = false
  } catch { /* no location */ }
  ready = true
  writeBoth(STATS_KEY, JSON.stringify(st))
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void flush())
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void flush() })
  }
}

export const statsView = () => st
export const subscribeStats = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const hasAgreed = () => !!st.agreed && st.agreed.version === TERMS_VERSION
export const statsOn = () => hasAgreed() && !st.noStats
/** People who used the app before counts existed are asked once; until they answer, nothing is sent. */
export const needsNotice = () => !st.agreed && !st.noStats

export function deviceId(): string {
  if (st.deviceId) return st.deviceId
  const id = uuid()
  save({ deviceId: id })
  return id
}

/** Agree to the terms (and the counts, unless they are off). `how`: 'welcome' or 'notice'. */
export function agree(how: string) {
  if (hasAgreed()) return
  save({ agreed: { version: TERMS_VERSION, on: dateKey(), how } })
}
/** Turn the counts off (or back on). Off deletes anything still waiting to be sent. */
export function setCountsOff(off: boolean) {
  save(off ? { noStats: true, outbox: [] } : { noStats: false })
  if (!off) void flush()
}
/** The one-time notice was answered with "Turn off counts": agreed to nothing, counts off. */
export function declineNotice() { save({ noStats: true, outbox: [] }) }

const platform = (): string => { try { return Capacitor.getPlatform() } catch { return 'web' } }
const standalone = () => {
  try { return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches } catch { return false }
}

/**
 * Queue one row, once per `key` (a step is counted once per morning however often a screen redraws or the app
 * reloads). Nothing is queued while the counts are off, so turning them on later never sends what happened before.
 */
export function track(kind: Kind, key: string, data: Record<string, Value> = {}, day = dateKey()) {
  if (!statsOn() || st.sent.includes(key)) return
  const row: Row = {
    event_id: uuid(), device_id: deviceId(), day, kind,
    data: { run: 0, home_screen: Capacitor.isNativePlatform() || standalone(), ...(st.test ? { test: true } : {}), ...data },
    app_version: STATS.version,
  }
  save({ outbox: [...st.outbox, row].slice(-50), sent: [...st.sent, key].slice(-80) })
  void flush()
}

/** App opened: once per local day. */
export function trackOpen(screen: string, onboarded: boolean) {
  const today = dateKey()
  track('app_opened', `${today}#open`, { platform: platform(), screen, onboarded })
}

/** Consecutive days ending today (or yesterday, before today's morning is done) in the completed-morning history. */
export function streakOf(history: string[], now = new Date()): number {
  const days = new Set(history)
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!days.has(dateKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dateKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

/**
 * One-time catch-up for people who finished mornings before counts existed (the Oct 8-10 testers): one summary row
 * with the dates of those mornings, sent the first time they agree. The database only takes rows dated within two
 * days, so the past mornings travel as a list of dates in today's row, never as back-dated rows.
 */
export function backfill(history: string[], onboarded: boolean) {
  if (st.backfilled || !statsOn()) return
  const days = [...new Set(history)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-60)
  save({ backfilled: true })
  if (!days.length && !onboarded) return
  track('history_synced', 'history#synced', { sunrises: days.length, streak: streakOf(days), days, onboarded })
}

const ROW_KEYS = ['event_id', 'device_id', 'day', 'kind', 'data', 'app_version']
const INGEST = `${STATS.url}?columns=${ROW_KEYS.join(',')}`
type Sent = 'sent' | 'conflict' | 'rejected' | 'later'
async function post(rows: Row[]): Promise<Sent> {
  try {
    const res = await fetch(INGEST, {
      method: 'POST', keepalive: true,
      headers: { apikey: STATS.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    })
    // sent (stored, or skipped as already there); conflict (409: a copy arrived at the same instant, so it is stored);
    // rejected for good (bad data, never retried); later (offline, busy)
    if (res.ok) return 'sent'
    if (res.status === 409) return 'conflict'
    return res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? 'rejected' : 'later'
  } catch { return 'later' }
}

let flushing = false
/** Send what's waiting. A batch that fails as a whole is retried row by row, so one bad row never blocks the rest. */
export async function flush() {
  if (flushing || !statsOn() || !st.outbox.length) return
  try { if (navigator.onLine === false) return } catch { /* unknown: try */ }
  flushing = true
  const rows = st.outbox
  const done = new Set<string>()
  let res = await post(rows)
  if (res === 'sent' || (res === 'conflict' && rows.length === 1)) rows.forEach((r) => done.add(r.event_id))
  else if ((res === 'rejected' || res === 'conflict') && rows.length > 1) {
    for (const r of rows) {
      if (!statsOn()) break
      res = await post([r])
      if (res !== 'later') done.add(r.event_id)
    }
  } else if (res === 'rejected') done.add(rows[0].event_id)
  flushing = false
  if (done.size) {
    // only the rows that went: the outbox may have changed while the request was out
    save({ outbox: st.outbox.filter((r) => !done.has(r.event_id)) })
    if (st.outbox.length && statsOn()) void flush()
  }
}
