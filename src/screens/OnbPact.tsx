import { useState } from 'react'
import { actions, useStore } from '../lib/store'
import { haptic } from '../lib/native'
import { Eyebrow, Frame, Hill, StepBars } from '../components/ui'

const IDEAS = ['To feel like myself again', 'For my family, before my phone', 'A clear head before work']

export default function OnbPact() {
  const s = useStore()
  const [stamping, setStamping] = useState(false)
  const has = s.pact.trim().length > 0
  const sealed = s.pactSealed

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
      <Eyebrow className="relative mt-7 text-muted-2" style={{ animation: 'fadeUp .6s ease both' }}>TONIGHT · 2 OF 4</Eyebrow>
      <h1 className="h-screen-title relative m-0 mt-2 text-[52px]" style={{ animation: 'fadeUp .6s ease .08s both' }}>Why do you want the morning back?</h1>
      <p className="relative m-0 mt-3.5 text-[17px] leading-[25px] text-muted" style={{ animation: 'fadeUp .6s ease .16s both' }}>One line. It’s the first thing you’ll read tomorrow.</p>

      <div className="relative mt-6" style={{ animation: sealed && stamping ? 'thud .4s ease .25s both' : undefined }}>
        <label htmlFor="pact" className="sr-only">Your pact</label>
        <textarea id="pact" rows={3} value={s.pact} readOnly={sealed} maxLength={140}
          onChange={(e) => actions.setPact(e.target.value)}
          placeholder="Say it the way you’d say it."
          className="w-full resize-none bg-hill-night text-cream placeholder:text-soft border-0 rounded-chunk p-[18px] font-display text-2xl leading-[1.2] font-semibold tracking-[-0.01em] select-text" />
        {sealed && (
          <span aria-hidden className="absolute -right-1.5 -bottom-[22px] w-[92px] h-[92px] rounded-full bg-coral flex items-center justify-center text-center text-[15px] leading-none font-extrabold text-ink"
            style={{ boxShadow: 'inset 0 0 0 5px #D35E46, 0 4px 0 #B5513C', animation: stamping ? 'stamp .7s cubic-bezier(.2,.9,.3,1.2) both' : undefined, transform: stamping ? undefined : 'rotate(-10deg)' }}>
            sealed<br />tonight
          </span>
        )}
      </div>

      {!sealed && (
        <div className="relative mt-4 flex flex-wrap gap-2" role="group" aria-label="Starter pacts">
          {IDEAS.map((label, i) => (
            <button key={label} type="button" onClick={() => { haptic('light'); actions.setPact(label + '.') }}
              className="min-h-[44px] px-4 rounded-full border-2 border-line bg-transparent text-cream font-display text-[15px] font-semibold cursor-pointer transition-transform duration-150 active:scale-95"
              style={{ animation: `pop .5s cubic-bezier(.2,.9,.3,1.3) ${0.3 + i * 0.08}s both` }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="relative mt-auto flex flex-col gap-3">
        <p className="m-0 text-[13px] text-soft text-center">Stays on this phone. Never sent.</p>
        {!sealed
          ? <button type="button" className="chunky chunky-butter" aria-disabled={!has} style={{ opacity: has ? 1 : 0.45 }} onClick={seal}>Seal my pact</button>
          : <button type="button" className="chunky chunky-butter" style={{ animation: 'pop .6s cubic-bezier(.2,.9,.3,1.2) .5s both' }} onClick={() => actions.go('hook')}>Next: your wake-up push</button>}
      </div>
    </Frame>
  )
}
