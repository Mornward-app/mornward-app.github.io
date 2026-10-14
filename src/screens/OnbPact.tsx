import { useState } from 'react'
import { actions, useStore } from '../lib/store'
import { haptic } from '../lib/native'
import { Eyebrow, Frame, Hill, StepBars } from '../components/ui'

/** Tap-first: most people tap a line. Typing is one optional tap away, so the step never starts with a blank box. */
export const IDEAS = [
  'To feel like myself again', 'For my family, before my phone', 'A clear head before work',
  'To start on my own terms', 'To move before I scroll', 'To be calm before the noise',
]
const asLine = (label: string) => label + '.'

export default function OnbPact() {
  const s = useStore()
  const [stamping, setStamping] = useState(false)
  const isIdea = IDEAS.some((l) => asLine(l) === s.pact)
  // writing mode starts closed, unless an earlier session left a line of their own
  const [writing, setWriting] = useState(!isIdea && s.pact.trim().length > 0 && !s.pactSealed)
  const has = s.pact.trim().length > 0
  const sealed = s.pactSealed

  const pick = (label: string) => { haptic('light'); setWriting(false); actions.setPact(asLine(label)) }
  const seal = () => {
    if (!has || sealed) return
    actions.sealPact()
    setStamping(true)
    window.setTimeout(() => haptic('medium'), 250)
  }

  return (
    <Frame testId="screen-pact" bg="#2B2A6B" fg="#FFF6E5" className="flex flex-col px-6 pb-[30px]">
      <div aria-hidden className="fixed inset-0 z-0 pointer-events-none overflow-hidden"><Hill color="#3D3C86" className="-left-[120px] -right-[120px] -bottom-[560px] h-[700px]" /></div>
      <StepBars step={2} />
      <Eyebrow className="relative mt-6 text-muted-2 [@media(max-height:700px)]:hidden" style={{ animation: 'fadeUp .6s ease both' }}>TONIGHT · 2 OF 4</Eyebrow>
      <h1 className="h-screen-title relative m-0 mt-2 text-[46px] [@media(max-height:900px)]:text-[42px] [@media(max-height:700px)]:text-[32px]" style={{ animation: 'fadeUp .6s ease .08s both' }}>Why do you want the morning back?</h1>
      <p className="relative m-0 mt-3 text-[17px] leading-[24px] text-muted [@media(max-height:700px)]:hidden" style={{ animation: 'fadeUp .6s ease .16s both' }}>
        {sealed ? 'It’s the first thing you’ll read tomorrow.' : 'Tap one. You’ll read it tomorrow.'}
      </p>

      {sealed ? (
        <div className="relative mt-6" style={{ animation: stamping ? 'thud .4s ease .25s both' : undefined }}>
          <p data-testid="pact-card" className="m-0 bg-hill-night rounded-chunk p-[18px] pb-6 text-[26px] leading-[1.2] font-semibold tracking-[-0.01em]">“{s.pact}”</p>
          <span aria-hidden className="absolute -right-1.5 -bottom-[22px] w-[92px] h-[92px] rounded-full bg-coral flex items-center justify-center text-center text-[15px] leading-none font-extrabold text-ink"
            style={{ boxShadow: 'inset 0 0 0 5px #D35E46, 0 4px 0 #B5513C', animation: stamping ? 'stamp .7s cubic-bezier(.2,.9,.3,1.2) both' : undefined, transform: stamping ? undefined : 'rotate(-10deg)' }}>
            sealed<br />tonight
          </span>
        </div>
      ) : (
        writing ? (
          <div className="relative mt-4">
            <label htmlFor="pact" className="sr-only">Your pact</label>
            <textarea id="pact" rows={3} value={s.pact} maxLength={140} autoFocus
              onChange={(e) => actions.setPact(e.target.value)}
              placeholder="Say it the way you’d say it."
              className="w-full resize-none bg-hill-night text-cream placeholder:text-soft border-0 rounded-chunk p-[16px] font-display text-[22px] leading-[1.2] font-semibold tracking-[-0.01em] select-text"
              style={{ animation: 'fadeUp .35s ease both' }} />
            <button type="button" className="linkish text-muted mt-1 -ml-4" data-testid="pick-a-line" onClick={() => { haptic('light'); setWriting(false); if (!isIdea) actions.setPact('') }}>Pick a line instead</button>
          </div>
        ) : (
          <div className="relative mt-5 [@media(max-height:700px)]:mt-3 flex flex-wrap gap-2 [@media(max-height:700px)]:gap-1.5" role="group" aria-label="Starter pacts">
            {IDEAS.map((label, i) => {
              const on = s.pact === asLine(label)
              return (
                <button key={label} type="button" aria-pressed={on} onClick={() => pick(label)}
                  className="min-h-[48px] [@media(max-height:700px)]:min-h-[44px] px-4 [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:text-[14px] rounded-full border-2 font-display text-[15px] font-semibold cursor-pointer transition-[transform,background-color,color,border-color] duration-150 active:scale-95"
                  style={{ borderColor: on ? '#FFE38A' : '#9896D8', background: on ? '#FFE38A' : 'transparent', color: on ? '#2B1B3A' : '#FFF6E5', animation: `pop .5s cubic-bezier(.2,.9,.3,1.3) ${0.2 + i * 0.06}s both` }}>
                  {label}
                </button>
              )
            })}
            <button type="button" aria-expanded={false} aria-controls="pact" onClick={() => { haptic('light'); setWriting(true) }}
              className="min-h-[48px] [@media(max-height:700px)]:min-h-[44px] px-4 [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:text-[14px] rounded-full border-2 border-dashed border-line bg-transparent text-cream font-display text-[15px] font-semibold cursor-pointer active:scale-95"
              style={{ animation: `pop .5s cubic-bezier(.2,.9,.3,1.3) .6s both` }}>
              Write my own
            </button>
          </div>
        )
      )}

      <div className="relative mt-auto pt-4 flex flex-col gap-3">
        <p className="m-0 text-[13px] text-soft text-center">Stays on this phone. Never sent.</p>
        {!sealed
          ? <button type="button" className="chunky chunky-butter" aria-disabled={!has} style={{ opacity: has ? 1 : 0.45 }} onClick={seal}>Seal my pact</button>
          : <button type="button" className="chunky chunky-butter" style={{ animation: 'pop .6s cubic-bezier(.2,.9,.3,1.2) .5s both' }} onClick={() => actions.go('hook')}>Next: your wake-up push</button>}
      </div>
    </Frame>
  )
}
