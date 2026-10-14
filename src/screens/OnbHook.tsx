import { useEffect, useRef, useState } from 'react'
import { actions, useStore } from '../lib/store'
import { cancelReminders, getPermissionState, haptic, openSystemSettings, type PushResult } from '../lib/native'
import { syncReminders } from '../lib/reminders'
import { fmtMins } from '../lib/dates'
import { notifBody, timeLabel } from '../lib/copy'
import { Eyebrow, Frame, StepBars } from '../components/ui'
import SunSlider from '../components/SunSlider'

type Note = 'on' | 'off' | 'declined' | PushResult

export default function OnbHook() {
  const s = useStore()
  const [note, setNote] = useState<Note>(s.pushOn ? 'on' : 'off')
  const f = fmtMins(s.wakeMins)
  const body = notifBody(s.picked)

  // Two-step permission: (1) our own plain explanation, (2) only on "Continue" the iOS system dialog.
  // iOS asks only once per install, so a "Not now" here costs nothing, while a refused system dialog is hard to undo.
  const [ask, setAsk] = useState(false)

  const enable = async () => {
    const r = await syncReminders(true) // the only place the iOS permission dialog may appear
    actions.setPush(r === 'scheduled')
    setNote(r === 'scheduled' ? 'on' : r)
  }

  const toggle = async () => {
    haptic('light')
    if (s.pushOn) {
      actions.setPush(false); setNote('off'); await cancelReminders(); return
    }
    const perm = await getPermissionState()
    if (perm === 'granted') { await enable(); return }
    if (perm === 'denied') { setNote('denied'); return }
    setAsk(true) // step 1: explain first
  }

  // moving either time (or changing tasks) re-registers the two OS triggers
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (!s.pushOn) return
    const id = window.setTimeout(() => { void syncReminders(false) }, 400)
    return () => window.clearTimeout(id)
  }, [s.wakeMins, s.eveningMins, s.pushOn, body])

  const step = (d: number) => { haptic('light'); actions.setWake(s.wakeMins + d) }
  const stepEve = (d: number) => { haptic('light'); actions.setEvening(s.eveningMins + d) }
  const eve = timeLabel(s.eveningMins)

  const done = async () => {
    haptic('success')
    if (s.pushOn) await syncReminders(false) // make sure the OS holds the latest times and tasks
    actions.armMorning()
  }

  const msg: Record<Note, string> = {
    off: 'Off. You can still open Mornward yourself.',
    on: 'Set with your phone. They arrive even when the app is closed, and never leave it.',
    scheduled: '',
    denied: 'Notifications are off for Mornward. Turn them on in Settings, or open it yourself.',
    declined: 'No problem. You can turn this on any time. Until then, open Mornward yourself.',
    unsupported: 'This device can’t schedule them. Open Mornward yourself.',
  }
  const roundBtn = 'w-12 h-12 rounded-full border-0 bg-cream text-ink text-2xl font-extrabold cursor-pointer transition-transform active:scale-90'

  return (
    <Frame testId="screen-hook" bg="#2B2A6B" fg="#FFF6E5" className="flex flex-col px-6 pb-[30px]">
      <StepBars step={3} />
      <Eyebrow className="mt-6 text-muted-2" style={{ animation: 'fadeUp .6s ease both' }}>TONIGHT · 3 OF 4</Eyebrow>
      <h1 className="h-screen-title m-0 mt-2 text-[48px] leading-[0.92]" style={{ animation: 'fadeUp .6s ease .08s both' }}>Let us push you. Once.</h1>
      <p className="m-0 mt-3 text-[17px] leading-[24px] text-muted [@media(max-height:700px)]:hidden" style={{ animation: 'fadeUp .6s ease .16s both' }}>
        At {f.t} {f.ap}, this lands before any other app gets the chance. One more at {eve} to plan tomorrow. Nothing else, ever.
      </p>

      <div className="mt-5 bg-hill-night rounded-3xl px-4 pt-4 pb-3.5 flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <div>
            <span className="label text-muted-2">I WAKE AT</span>
            <p className="m-0 text-[44px] leading-none font-extrabold tracking-[-0.03em]" data-testid="wake-time">{f.t}<span className="label ml-2 align-middle text-soft">{f.ap}</span></p>
          </div>
          <div className="flex gap-2">
            <button type="button" aria-label="15 minutes earlier" onClick={() => step(-15)}
              className={roundBtn}>−</button>
            <button type="button" aria-label="15 minutes later" onClick={() => step(15)}
              className={roundBtn}>+</button>
          </div>
        </div>
        <SunSlider mins={s.wakeMins} onChange={(m) => { if (m !== s.wakeMins) { haptic('light'); actions.setWake(m) } }} />
      </div>

      <div className="mt-3 bg-hill-night rounded-3xl px-4 py-2.5 flex items-center justify-between">
        <div>
          <span className="label text-muted-2">EVENING REMINDER</span>
          <p className="m-0 text-[24px] leading-[1.1] font-extrabold tracking-[-0.02em]" data-testid="evening-time">{eve}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Evening reminder 15 minutes earlier" onClick={() => stepEve(-15)} className={roundBtn}>−</button>
          <button type="button" aria-label="Evening reminder 15 minutes later" onClick={() => stepEve(15)} className={roundBtn}>+</button>
        </div>
      </div>

      <div aria-hidden className="mt-4 [@media(max-height:900px)]:hidden pointer-events-none" style={{ transformOrigin: '50% -60px', animation: 'swing 1.3s cubic-bezier(.3,.8,.4,1) .35s both' }}>
        <div className="bg-cream text-ink rounded-3xl px-4 py-3 flex gap-3 items-start" style={{ boxShadow: '0 6px 0 #C9B9A0' }}>
          <span aria-hidden className="flex-none w-10 h-10 rounded-[11px] bg-night flex items-center justify-center" style={{ animation: 'bell 2.8s ease-in-out 1.6s infinite' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFE38A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
          </span>
          <div className="flex-1 flex flex-col gap-0.5 min-w-0">
            <div className="flex justify-between"><span className="mono text-[11px] tracking-[0.1em] text-label-2">MORNWARD</span><span className="text-[13px] text-label-2">{f.t}</span></div>
            <span className="text-[17px] font-extrabold">Before the feed.</span>
            <span className="text-[15px] leading-5 text-label">{body}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p id="push-label" className="m-0 text-[17px] font-extrabold">Daily reminders</p>
          {s.pushOn && note === 'on' ? (
            <p className="m-0 mt-1 inline-flex items-center gap-1.5 rounded-full border border-sun/60 px-2.5 py-0.5 text-[12px] font-semibold text-sun" role="status" data-testid="alarm-badge" style={{ animation: 'pop .4s cubic-bezier(.2,.9,.3,1.3) both' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFE38A" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
              Alarm set for {timeLabel(s.wakeMins)} · evening {eve}
            </p>
          ) : null}
          <p className="m-0 mt-0.5 text-[13px] leading-[18px] text-soft" role="status" data-testid="push-note">{msg[note]}</p>
          {note === 'denied' && (
            <button type="button" className="mt-1 min-h-[44px] bg-transparent border-0 p-0 font-display text-[14px] font-semibold text-cream underline underline-offset-4 cursor-pointer" data-testid="open-settings" onClick={() => void openSystemSettings()}>Open Settings</button>
          )}
        </div>
        <button type="button" role="switch" aria-checked={s.pushOn} aria-labelledby="push-label" onClick={toggle}
          className="relative flex-none w-[64px] h-[44px] rounded-full border-0 cursor-pointer transition-colors duration-200"
          style={{ background: s.pushOn ? '#FFE38A' : '#9896D8' }}>
          <span aria-hidden className="absolute top-1 w-9 h-9 rounded-full transition-[left,background-color] duration-200"
            style={{ left: s.pushOn ? 24 : 4, background: s.pushOn ? '#2B1B3A' : '#FFF6E5' }} />
        </button>
      </div>

      <div className="mt-auto pt-4">
        <button type="button" className="chunky chunky-butter" onClick={done}>Set my morning</button>
      </div>
      {ask && <PrePrompt wake={timeLabel(s.wakeMins)} eve={eve}
        onContinue={() => { setAsk(false); void enable() }}
        onNotNow={() => { setAsk(false); setNote('declined') }} />}
    </Frame>
  )
}

function PrePrompt({ wake, eve, onContinue, onNotNow }: { wake: string; eve: string; onContinue: () => void; onNotNow: () => void }) {
  const go = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    go.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onNotNow() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onNotNow])
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-deep/70" data-testid="pre-prompt-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="pp-h" data-testid="pre-prompt"
        className="bg-cream text-ink rounded-t-[28px] px-6 pt-6 flex flex-col gap-3 font-display" style={{ animation: 'sheetUp .4s cubic-bezier(.2,.8,.2,1) both', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', ['--ring' as string]: '#2B1B3A' }}>
        <p className="label m-0 text-ember">STEP 1 OF 2 · BEFORE iOS ASKS</p>
        <h2 id="pp-h" className="m-0 text-[30px] leading-[1.02] font-extrabold tracking-[-0.03em]">Let Mornward nudge you?</h2>
        <p className="m-0 text-[16px] leading-[23px] text-label">Two quiet reminders: <strong>{wake}</strong> to start your morning and <strong>{eve}</strong> to plan the next one. They run on this phone and arrive even when the app is closed.</p>
        <p className="m-0 text-[14px] leading-[20px] text-label">Next, iOS will ask you to confirm. Tap Allow.</p>
        <button ref={go} type="button" className="chunky chunky-ink mt-1" data-testid="pp-continue" onClick={onContinue}>Continue</button>
        <button type="button" className="linkish text-ink self-center" data-testid="pp-not-now" onClick={onNotNow}>Not now</button>
      </section>
    </div>
  )
}
