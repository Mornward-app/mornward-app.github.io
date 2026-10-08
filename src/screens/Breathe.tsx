import { useEffect, useRef, useState } from 'react'
import { actions, useStore } from '../lib/store'
import { haptic } from '../lib/native'
import { Frame, Hill } from '../components/ui'

/** Breath Hold Guard: a breath counts only after a real 3.2 second press-and-hold on the sun. */
export const MIN_HOLD_MS = 3200
const BG = ['#2B2A6B', '#3A2F78', '#4E3584', '#6B3F7A']
const IDLE_SCALE = 170 / 290
const GLOW_IDLE = 230 / 400

type Phase = 'idle' | 'in' | 'reached' | 'out' | 'short'

const COPY: Record<Exclude<Phase, 'idle'> | 'idle' | 'done', [string, string]> = {
  idle: ['hold the sun', 'Press and hold to breathe in.'],
  in: ['breathe in', 'Keep holding. Slowly.'],
  reached: ['breathe in', 'Let go when you’re full.'],
  out: ['and out', 'Slowly. Then hold again.'],
  short: ['almost', 'Hold a little longer with your breath.'],
  done: ['you’re awake.', 'Three breaths. Now, the plan.'],
}

export default function Breathe() {
  const s = useStore()
  const n = s.day.breaths
  const done = n >= 3
  const [phase, setPhase] = useState<Phase>(n > 0 ? 'out' : 'idle')
  const startRef = useRef<number | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const shortRef = useRef<number | undefined>(undefined)

  const holding = phase === 'in' || phase === 'reached'
  const key: keyof typeof COPY = done ? 'done' : phase
  const [h1, sub] = COPY[key]

  const cancelTimers = () => { window.clearTimeout(timerRef.current); window.clearTimeout(shortRef.current) }
  useEffect(() => cancelTimers, [])

  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (done || startRef.current !== null) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not all pointers can be captured */ }
    cancelTimers()
    startRef.current = performance.now()
    setPhase('in')
    timerRef.current = window.setTimeout(() => { haptic('light'); setPhase((p) => (p === 'in' ? 'reached' : p)) }, MIN_HOLD_MS)
  }

  const release = () => {
    if (startRef.current === null) return
    const held = performance.now() - startRef.current
    startRef.current = null
    window.clearTimeout(timerRef.current)
    if (held >= MIN_HOLD_MS) {
      actions.countBreath()
      haptic('light')
      setPhase('out')
    } else {
      // released early: no count, the sun springs back
      setPhase('short')
      shortRef.current = window.setTimeout(() => setPhase((p) => (p === 'short' ? (s.day.breaths > 0 ? 'out' : 'idle') : p)), 3000)
    }
  }

  // leaving the app mid-hold never counts
  useEffect(() => {
    const abandon = () => { if (document.hidden && startRef.current !== null) { startRef.current = null; window.clearTimeout(timerRef.current); setPhase('idle') } }
    document.addEventListener('visibilitychange', abandon)
    return () => document.removeEventListener('visibilitychange', abandon)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); if (!done && startRef.current === null) {
      cancelTimers(); startRef.current = performance.now(); setPhase('in')
      timerRef.current = window.setTimeout(() => { haptic('light'); setPhase((p) => (p === 'in' ? 'reached' : p)) }, MIN_HOLD_MS)
    } }
  }
  const onKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release() } }

  const scale = holding ? 1 : IDLE_SCALE
  const dur = holding ? '4s' : phase === 'short' ? '0.5s' : '6s'
  const ease = phase === 'short' ? 'cubic-bezier(.34,1.4,.5,1)' : 'cubic-bezier(.4,0,.2,1)'

  return (
    <Frame testId="screen-breathe" bg={BG[Math.min(n, 3)]} fg="#FFF6E5" className="flex flex-col items-center text-center" style={{ transitionDuration: '1200ms', ['--ring' as string]: '#FFF6E5' }}>
      <div className="relative z-10 flex flex-col items-center w-full">
        <div className="mt-9 flex gap-2" role="img" aria-label={`${n} of 3 breaths`} data-testid="breath-dots" data-count={n}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-3 h-3 rounded-full border-2 border-sun box-border" style={{ background: i < n ? '#FFE38A' : 'transparent', animation: i < n ? 'dotFill .5s cubic-bezier(.2,.9,.3,1.3) both' : undefined }} />
          ))}
        </div>
        <p className="m-0 mt-[22px] mx-7 text-[19px] leading-[1.3] font-semibold text-muted line-clamp-2" data-testid="breathe-pact">“{s.pact || 'I want my mornings to feel like mine again.'}”</p>
        <div className="mt-[7vh] min-h-[120px] px-4" aria-live="polite" data-testid="breathe-state" data-phase={key}>
          <div key={key} style={{ animation: `${key === 'done' ? 'pop .7s cubic-bezier(.2,.9,.3,1.2)' : 'fadeUp .6s ease'} both` }}>
            <h1 className="m-0 text-[56px] leading-none font-extrabold tracking-[-0.035em]">{h1}</h1>
            <p className="m-0 mt-3 text-[17px] text-muted">{sub}</p>
          </div>
        </div>
      </div>

      {/* sun, glow and rings sit behind the foreground; hills never block the press */}
      <div className="absolute inset-0 z-0" style={{ pointerEvents: 'none' }}>
        <div className="absolute left-1/2 w-0 h-0" style={{ top: '76.3%' }}>
          {holding && [0, 1].map((i) => (
            <span key={i} aria-hidden className="absolute -ml-[150px] -mt-[150px] w-[300px] h-[300px] rounded-full border-[3px] border-sun" style={{ animation: `ring 2s ease-out ${i}s infinite` }} />
          ))}
          <span aria-hidden className="absolute -ml-[200px] -mt-[200px] w-[400px] h-[400px] rounded-full bg-coral" style={{ opacity: 0.55, transform: `scale(${holding ? 1 : GLOW_IDLE})`, transition: `transform ${dur} ${ease}` }} />
          <svg aria-hidden className="absolute -ml-[160px] -mt-[160px] w-[320px] h-[320px] -rotate-90" viewBox="0 0 320 320">
            {holding && <circle key={String(holding)} cx="160" cy="160" r="156" fill="none" stroke={phase === 'reached' ? '#FFF6E5' : '#FFE38A'} strokeWidth="4" strokeLinecap="round" strokeDasharray="980" strokeDashoffset="980" style={{ animation: `holdFill ${MIN_HOLD_MS}ms linear forwards` }} />}
          </svg>
          <div className="absolute -ml-[145px] -mt-[145px] w-[290px] h-[290px]" style={{ animation: !holding && !done ? 'idle 3.2s ease-in-out infinite' : undefined }}>
            <button type="button" aria-label="Hold to breathe in, release to breathe out" data-testid="sun-orb"
              onPointerDown={press} onPointerUp={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}
              onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={release}
              className="w-full h-full rounded-full border-0 p-0 bg-sun cursor-pointer select-none"
              style={{ touchAction: 'none', pointerEvents: done ? 'none' : 'auto', transform: `scale(${scale})`, transition: `transform ${dur} ${ease}`, WebkitTouchCallout: 'none' }} />
          </div>
        </div>
        <Hill color="#E8735A" className="-left-[120px] -right-[120px] top-[76.3%] h-[500px] !rounded-[50%_50%_0_0]" />
        <Hill color="#2B1B3A" className="-left-[160px] -right-[160px] top-[83%] h-[500px] !rounded-[50%_50%_0_0]" />
      </div>

      <div className="absolute z-10 left-6 right-6 flex flex-col items-center" style={{ bottom: 'calc(30px + env(safe-area-inset-bottom))' }}>
        {done
          ? <button type="button" className="chunky chunky-butter" style={{ animation: 'pop .6s cubic-bezier(.2,.9,.3,1.2) .2s both' }} onClick={() => actions.go('act')}>Now, the plan</button>
          : <button type="button" className="linkish text-muted" onClick={() => { actions.skipBreathing(); actions.go('act') }}>Skip breathing</button>}
      </div>
    </Frame>
  )
}
