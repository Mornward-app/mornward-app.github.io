import { useSyncExternalStore } from 'react'
import { CARDS } from './cards'
import { dateKey } from './dates'

export type ScreenId = 'plan' | 'pact' | 'hook' | 'sleep' | 'wake' | 'breathe' | 'act' | 'down'

export const STORAGE_KEY = 'mornward.daybreak.v1'
export const MAX_TASKS = 3
export const MAX_CUSTOM = 3
export const STARTER_TASKS = ['Water first', 'Short walk', 'Stretch', 'Morning light', 'One quiet minute', 'Check on a friend']
export const DEFAULT_WAKE = 7 * 60 // 7:00 AM

export interface DayState {
  date: string
  breaths: number
  ticked: boolean[]
  doneAt: string | null
  cardIdx: number
  cardOpened: boolean
}

export interface State {
  v: 1
  screen: ScreenId
  onboarded: boolean
  custom: string[]
  hidden: string[]
  picked: string[]
  pact: string
  pactSealed: boolean
  wakeMins: number
  pushOn: boolean
  day: DayState
  history: string[]
  opened: number[]
}

export const lastUnpickedStarter = (s: Pick<State, 'picked' | 'hidden'>) =>
  [...STARTER_TASKS].reverse().find((x) => !s.picked.includes(x) && !s.hidden.includes(x)) ?? null

const MORNING_SCREENS: ScreenId[] = ['wake', 'breathe', 'act', 'down']

function freshDay(s: Pick<State, 'picked' | 'opened'>, date = dateKey()): DayState {
  return { date, breaths: 0, ticked: s.picked.map(() => false), doneAt: null, cardIdx: s.opened.length % CARDS.length, cardOpened: false }
}

function initial(): State {
  const base = { picked: ['Water first', 'Short walk'], opened: [] as number[] }
  return {
    v: 1, screen: 'plan', onboarded: false, custom: [], hidden: [], picked: base.picked, pact: '', pactSealed: false,
    wakeMins: DEFAULT_WAKE, pushOn: false, day: freshDay(base), history: [], opened: base.opened,
  }
}

const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string')
const isNumArr = (x: unknown): x is number[] => Array.isArray(x) && x.every((n) => typeof n === 'number')

function load(): State {
  const base = initial()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const p = JSON.parse(raw) as Partial<State>
    const s: State = { ...base }
    if (typeof p.screen === 'string' && ['plan', 'pact', 'hook', 'sleep', 'wake', 'breathe', 'act', 'down'].includes(p.screen)) s.screen = p.screen as ScreenId
    if (typeof p.onboarded === 'boolean') s.onboarded = p.onboarded
    if (isStrArr(p.custom)) s.custom = p.custom.slice(0, MAX_CUSTOM)
    if (isStrArr(p.hidden)) s.hidden = p.hidden.filter((h) => STARTER_TASKS.includes(h))
    if (isStrArr(p.picked)) s.picked = p.picked.slice(0, MAX_TASKS)
    if (typeof p.pact === 'string') s.pact = p.pact
    if (typeof p.pactSealed === 'boolean') s.pactSealed = p.pactSealed
    if (typeof p.wakeMins === 'number' && p.wakeMins >= 240 && p.wakeMins <= 660) s.wakeMins = p.wakeMins
    if (typeof p.pushOn === 'boolean') s.pushOn = p.pushOn
    if (isStrArr(p.history)) s.history = p.history
    if (isNumArr(p.opened)) s.opened = p.opened.filter((i) => i >= 0 && i < CARDS.length)
    const d = p.day
    s.day = d && typeof d.date === 'string' && Array.isArray(d.ticked) && d.ticked.length === s.picked.length
      ? { date: d.date, breaths: Math.min(3, Math.max(0, d.breaths | 0)), ticked: d.ticked.map(Boolean), doneAt: d.doneAt ?? null,
          cardIdx: typeof d.cardIdx === 'number' ? d.cardIdx % CARDS.length : s.opened.length % CARDS.length, cardOpened: !!d.cardOpened }
      : freshDay(s, typeof d?.date === 'string' ? d.date : dateKey())
    return s
  } catch {
    return base
  }
}

/** Roll over to a new day: keep history, unseal a new card, route to the right screen for the time of day. */
export function rollover(s: State, now = new Date()): State {
  const today = dateKey(now)
  if (s.day.date === today) return s
  const mins = now.getHours() * 60 + now.getMinutes()
  const inMorning = mins >= s.wakeMins - 60 && mins < 12 * 60
  const screen: ScreenId = s.onboarded ? (inMorning ? 'wake' : 'sleep') : s.screen
  return { ...s, screen, day: freshDay(s, today) }
}

let state: State = rollover(load())
const listeners = new Set<() => void>()

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* private mode: keep working in memory */ }
}
function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p }
  persist()
  listeners.forEach((l) => l())
}
persist()

export const getState = () => state
export function useStore(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, getState, getState)
}

/** Re-check the date (the app may stay open overnight). */
export function checkDay() { const next = rollover(state); if (next !== state) set(next) }

export const actions = {
  go(screen: ScreenId) { set({ screen }) },
  /** Notification tap: land on the Wake screen. */
  openFromNotification() {
    checkDay()
    if (state.onboarded && state.day.doneAt === null) set({ screen: 'wake' })
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
  setWake(wakeMins: number) { set({ wakeMins: Math.min(660, Math.max(240, wakeMins)) }) },
  setPush(pushOn: boolean) { set({ pushOn }) },
  finishOnboarding() { set({ onboarded: true }) },
  /** Called only for a real hold of at least MIN_HOLD_MS. */
  countBreath() { if (state.day.breaths < 3) set({ day: { ...state.day, breaths: state.day.breaths + 1 } }) },
  skipBreathing() { set({ day: { ...state.day, breaths: 3 } }) },
  tick(i: number) {
    const ticked = state.day.ticked.map((v, k) => (k === i ? !v : v))
    const all = ticked.length > 0 && ticked.every(Boolean)
    const today = dateKey()
    const history = all ? (state.history.includes(today) ? state.history : [...state.history, today])
      : state.history.filter((d) => d !== today)
    set({ day: { ...state.day, ticked, doneAt: all ? new Date().toISOString() : null }, history })
  },
  openCard() {
    if (state.day.cardOpened) return
    const idx = state.day.cardIdx
    set({ day: { ...state.day, cardOpened: true }, opened: state.opened.includes(idx) ? state.opened : [...state.opened, idx] })
  },
  /** Start a fresh morning from the Wake screen preview (used by "Good night" in the first evening). */
  resetMorning() { set({ day: freshDay(state) }) },
}

export const isMorningScreen = (s: ScreenId) => MORNING_SCREENS.includes(s)
