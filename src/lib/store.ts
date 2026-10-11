import { useSyncExternalStore } from 'react'
import { CARDS } from './cards'
import { dateKey } from './dates'
import { readBoth, requestPersistentStorage, writeBoth } from './storage'
import { streakOf, track, trackOpen } from './stats'

export type ScreenId = 'welcome' | 'plan' | 'pact' | 'hook' | 'sleep' | 'wake' | 'breathe' | 'act' | 'down' | 'rest'
const SCREENS: ScreenId[] = ['welcome', 'plan', 'pact', 'hook', 'sleep', 'wake', 'breathe', 'act', 'down', 'rest']

export const STORAGE_KEY = 'mornward.daybreak.v1'
export const MAX_TASKS = 3
export const MAX_CUSTOM = 3
export const STARTER_TASKS = ['Water first', 'Short walk', 'Stretch', 'Morning light', 'One quiet minute', 'Check on a friend']

export const DEFAULT_WAKE = 7 * 60 // 7:00 AM
export const WAKE_MIN = 5 * 60 // the sun slider spans 5:00 AM to 10:00 AM in 15 minute steps
export const WAKE_MAX = 10 * 60
export const WAKE_STEP = 15
export const clampWake = (m: number) => Math.min(WAKE_MAX, Math.max(WAKE_MIN, Math.round(m / WAKE_STEP) * WAKE_STEP))

export const DEFAULT_EVENING = 21 * 60 // 9:00 PM prep reminder
export const EVE_MIN = 18 * 60
export const EVE_MAX = 23 * 60
export const clampEvening = (m: number) => Math.min(EVE_MAX, Math.max(EVE_MIN, Math.round(m / WAKE_STEP) * WAKE_STEP))

/** From 6:00 PM the app opens on Evening Setup; from 4:00 AM an armed morning opens on the Wake screen. */
export const EVENING_START = 18 * 60
export const MORNING_START = 4 * 60

export interface DayState {
  date: string
  breaths: number
  ticked: boolean[]
  doneAt: string | null
  cardIdx: number
  cardOpened: boolean
  /** breathing was skipped this morning (only counted, never shown) */
  breathSkipped?: boolean
}

export interface State {
  v: 1
  /** when this copy was written; on launch the newer of the two stored copies wins */
  savedAt: number
  screen: ScreenId
  onboarded: boolean
  custom: string[]
  hidden: string[]
  picked: string[]
  pact: string
  pactSealed: boolean
  wakeMins: number
  eveningMins: number
  pushOn: boolean
  /** date key of the morning that tonight's setup armed, or null while tomorrow is not planned yet */
  armedFor: string | null
  day: DayState
  /** days the morning was completed: the sunrises on the week tracker */
  history: string[]
  opened: number[]
  /** total cards ever unsealed; picks the next card, so the deck keeps looping after all 21 are open */
  unlocks: number
}

export const lastUnpickedStarter = (s: Pick<State, 'picked' | 'hidden'>) =>
  [...STARTER_TASKS].reverse().find((x) => !s.picked.includes(x) && !s.hidden.includes(x)) ?? null

const MORNING: ScreenId[] = ['wake', 'breathe', 'act', 'down', 'rest']
const EDITING: ScreenId[] = ['plan', 'pact', 'hook']

function freshDay(s: Pick<State, 'picked' | 'unlocks'>, date = dateKey()): DayState {
  return { date, breaths: 0, ticked: s.picked.map(() => false), doneAt: null, cardIdx: s.unlocks % CARDS.length, cardOpened: false }
}

function initial(): State {
  const base = { picked: ['Water first', 'Short walk'], opened: [] as number[], unlocks: 0 }
  return {
    v: 1, savedAt: 0, screen: 'welcome', onboarded: false, custom: [], hidden: [], picked: base.picked, pact: '', pactSealed: false,
    wakeMins: DEFAULT_WAKE, eveningMins: DEFAULT_EVENING, pushOn: false, armedFor: null,
    day: freshDay(base), history: [], opened: base.opened, unlocks: 0,
  }
}

const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string')
const isNumArr = (x: unknown): x is number[] => Array.isArray(x) && x.every((n) => typeof n === 'number')

/** Validate a stored copy field by field, so a damaged or older copy can never crash the app. */
export function parse(raw: string | null): State | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as Partial<State>
    if (!p || typeof p !== 'object') return null
    const s = initial()
    if (typeof p.savedAt === 'number') s.savedAt = p.savedAt
    if (typeof p.screen === 'string' && SCREENS.includes(p.screen as ScreenId)) s.screen = p.screen as ScreenId
    if (typeof p.onboarded === 'boolean') s.onboarded = p.onboarded
    if (isStrArr(p.custom)) s.custom = p.custom.slice(0, MAX_CUSTOM)
    if (isStrArr(p.hidden)) s.hidden = p.hidden.filter((h) => STARTER_TASKS.includes(h))
    if (isStrArr(p.picked)) s.picked = p.picked.slice(0, MAX_TASKS)
    if (typeof p.pact === 'string') s.pact = p.pact
    if (typeof p.pactSealed === 'boolean') s.pactSealed = p.pactSealed
    if (typeof p.wakeMins === 'number' && Number.isFinite(p.wakeMins)) s.wakeMins = clampWake(p.wakeMins)
    if (typeof p.eveningMins === 'number' && Number.isFinite(p.eveningMins)) s.eveningMins = clampEvening(p.eveningMins)
    if (typeof p.pushOn === 'boolean') s.pushOn = p.pushOn
    if (typeof p.armedFor === 'string' || p.armedFor === null) s.armedFor = p.armedFor ?? null
    if (isStrArr(p.history)) s.history = p.history
    if (isNumArr(p.opened)) s.opened = p.opened.filter((i) => i >= 0 && i < CARDS.length)
    s.unlocks = typeof p.unlocks === 'number' && p.unlocks >= 0 ? Math.floor(p.unlocks) : s.opened.length
    const d = p.day
    s.day = d && typeof d.date === 'string' && Array.isArray(d.ticked) && d.ticked.length === s.picked.length
      ? { date: d.date, breaths: Math.min(3, Math.max(0, d.breaths | 0)), ticked: d.ticked.map(Boolean), doneAt: d.doneAt ?? null,
          cardIdx: typeof d.cardIdx === 'number' ? d.cardIdx % CARDS.length : s.unlocks % CARDS.length, cardOpened: !!d.cardOpened,
          ...(d.breathSkipped === true ? { breathSkipped: true } : {}) }
      : freshDay(s, typeof d?.date === 'string' ? d.date : dateKey())
    return s
  } catch {
    return null
  }
}

const minsOf = (d: Date) => d.getHours() * 60 + d.getMinutes()
const addDays = (d: Date, n: number) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x }
/** The morning a setup done right now is for: today before 4:00 AM, otherwise tomorrow. */
export const nextMorningKey = (now = new Date()) => dateKey(minsOf(now) < MORNING_START ? now : addDays(now, 1))

/** New day: keep history, unseal the next card, and drop yesterday's morning screens. */
export function rollover(s: State, now = new Date()): State {
  const today = dateKey(now)
  if (s.day.date === today) return s
  return { ...s, screen: MORNING.includes(s.screen) ? 'sleep' : s.screen, day: freshDay(s, today) }
}

/** Start Evening Setup: tomorrow's tasks stay selected, the pact is a fresh note for the next morning. */
export const beginEvening = (s: State): State => ({ ...s, screen: 'plan', pact: '', pactSealed: false, armedFor: null })

/**
 * Lifecycle: which screen the app belongs on right now.
 *  - from 6:00 PM (until 4:00 AM): Evening Setup until tomorrow is armed, then the waiting sun
 *  - from 4:00 AM, an armed morning opens on the Wake screen
 *  - a finished morning stays on the completed screens, never back on Wake
 * Screens the user is actively editing are never yanked away.
 */
export function settle(s: State, now = new Date()): State {
  if (!s.onboarded) return s
  const mins = minsOf(now)
  const today = dateKey(now)
  const done = s.day.date === today && s.day.doneAt !== null
  const editing = EDITING.includes(s.screen)
  const night = mins >= EVENING_START || mins < MORNING_START

  if (night) {
    if (editing) return s
    if (s.armedFor === nextMorningKey(now)) return s.screen === 'sleep' ? s : { ...s, screen: 'sleep' }
    return beginEvening(s)
  }
  if (editing) return s
  if (done) return ['down', 'rest', 'sleep'].includes(s.screen) ? s : { ...s, screen: 'down' }
  if (s.screen === 'sleep') {
    if (s.armedFor === today || mins < 12 * 60) return { ...s, screen: 'wake' }
  }
  return s
}

let state: State = initial()
let ready = false
const listeners = new Set<() => void>()

function persist() {
  if (!ready) return // never overwrite saved data before it has been read
  writeBoth(STORAGE_KEY, JSON.stringify(state))
}
function set(patch: Partial<State>) {
  state = { ...state, ...patch, savedAt: Date.now() }
  persist()
  listeners.forEach((l) => l())
}

/** Read both stored copies (device Preferences and localStorage), keep the newer, then render. Call once before the first render. */
export async function hydrate() {
  const { pref, local } = await readBoth(STORAGE_KEY)
  const a = parse(pref)
  const b = parse(local)
  const best = a && b ? (a.savedAt >= b.savedAt ? a : b) : (a ?? b)
  state = settle(rollover(best ?? initial()))
  ready = true
  persist() // write the winner back to both stores so they agree
  void requestPersistentStorage()
}

export const getState = () => state
export function useStore(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getState, getState)
}

/** Re-check date and time (the app can stay open overnight, or iOS can bring it back from the background). */
export function checkDay() { const next = settle(rollover(state)); if (next !== state) set(next); trackOpen(state.screen, state.onboarded) }

export const actions = {
  go(screen: ScreenId) { set({ screen }) },
  /** Notification tap: morning goes to Wake, evening goes to Evening Setup. */
  openFromNotification(kind: 'morning' | 'evening' = 'morning') {
    checkDay()
    if (!state.onboarded) return
    if (kind === 'evening') { if (!EDITING.includes(state.screen)) set(beginEvening(state)) }
    else if (state.day.doneAt === null && !EDITING.includes(state.screen)) set({ screen: 'wake' })
  },
  /** "Plan Tomorrow's Morning": a new night, same tasks, fresh note. */
  startEvening() { set(beginEvening(state)) },
  /** "Set my morning": tomorrow is planned. From now the app waits, and opens on Wake after 4:00 AM. */
  armMorning() {
    const armedFor = nextMorningKey()
    set({ armedFor, screen: 'sleep' })
    track('evening_set', `${armedFor}#evening`, {
      tasks: state.picked.length, own: state.picked.some((p) => state.custom.includes(p)), pact: state.pactSealed, push: state.pushOn,
    })
  },
  togglePick(label: string): 'ok' | 'limit' {
    const on = state.picked.includes(label)
    if (!on && state.picked.length >= MAX_TASKS) return 'limit'
    const picked = on ? state.picked.filter((x) => x !== label) : [...state.picked, label]
    set({ picked, day: { ...state.day, ticked: picked.map(() => false), doneAt: null } })
    return 'ok'
  },
  /** Adds a custom task. The last unpicked starter vanishes to make room (see lastUnpickedStarter). */
  addCustom(text: string): boolean {
    const label = text.trim().replace(/\s+/g, ' ').slice(0, 32)
    const all = [...STARTER_TASKS, ...state.custom]
    if (!label || state.custom.length >= MAX_CUSTOM || all.some((x) => x.toLowerCase() === label.toLowerCase())) return false
    const vanished = lastUnpickedStarter(state)
    const canPick = state.picked.length < MAX_TASKS
    const picked = canPick ? [...state.picked, label] : state.picked
    set({
      custom: [...state.custom, label], picked,
      hidden: vanished ? [...state.hidden, vanished] : state.hidden,
      day: { ...state.day, ticked: picked.map(() => false), doneAt: null },
    })
    return true
  },
  setPact(pact: string) { if (!state.pactSealed) set({ pact: pact.slice(0, 140) }) },
  sealPact() { if (state.pact.trim()) set({ pactSealed: true, pact: state.pact.trim() }) },
  unsealPact() { set({ pactSealed: false }) },
  setWake(wakeMins: number) { const w = clampWake(wakeMins); if (w !== state.wakeMins) set({ wakeMins: w }) },
  setEvening(eveningMins: number) { const e = clampEvening(eveningMins); if (e !== state.eveningMins) set({ eveningMins: e }) },
  setPush(pushOn: boolean) { set({ pushOn }) },
  finishOnboarding() { set({ onboarded: true }) },
  /** Called only for a real hold of at least MIN_HOLD_MS. */
  countBreath() {
    if (state.day.breaths >= 3) return
    set({ day: { ...state.day, breaths: state.day.breaths + 1 } })
    if (state.day.breaths === 3) track('sun_hold_done', `${state.day.date}#sun`, { breaths: 3 }, state.day.date)
  },
  skipBreathing() {
    const held = state.day.breaths
    if (held >= 3) return
    set({ day: { ...state.day, breaths: 3, breathSkipped: true } })
    track('breaths_skipped', `${state.day.date}#skip`, { held }, state.day.date)
  },
  tick(i: number) {
    const ticked = state.day.ticked.map((v, k) => (k === i ? !v : v))
    const all = ticked.length > 0 && ticked.every(Boolean)
    const today = dateKey()
    const history = all ? (state.history.includes(today) ? state.history : [...state.history, today])
      : state.history.filter((d) => d !== today)
    set({ day: { ...state.day, ticked, doneAt: all ? new Date().toISOString() : null }, history })
    if (all) track('morning_completed', `${state.day.date}#done`, {
      tasks: ticked.length, breathing: state.day.breathSkipped ? 'skipped' : 'held', streak: streakOf(history), sunrises: history.length,
    }, state.day.date)
  },
  openCard() {
    if (state.day.cardOpened) return
    const idx = state.day.cardIdx
    set({ day: { ...state.day, cardOpened: true }, unlocks: state.unlocks + 1, opened: state.opened.includes(idx) ? state.opened : [...state.opened, idx] })
    track('card_opened', `${state.day.date}#card`, {}, state.day.date)
  },
}
