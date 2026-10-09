import { useState } from 'react'
import { actions, useStore } from '../lib/store'
import { haptic, putPhoneDown } from '../lib/native'
import { timeLabel } from '../lib/copy'
import { fmtMins } from '../lib/dates'
import { Eyebrow, Frame, Hill, StepBars } from '../components/ui'

const STARS = [{ l: 60, t: 230, s: 4, d: 1 }, { l: 300, t: 280, s: 3, d: 1.6 }, { l: 200, t: 200, s: 3, d: 2.1 }, { l: 110, t: 330, s: 3, d: 0.6 }, { l: 335, t: 190, s: 2, d: 1.2 }]

export default function OnbSleep() {
  const s = useStore()
  const f = fmtMins(s.wakeMins)
  const [dim, setDim] = useState(false)
  const goodNight = async () => {
    haptic('success')
    if (!s.onboarded) { actions.finishOnboarding(); actions.go('wake'); return } // first night: a peek at the morning
    await putPhoneDown()
    setDim(true)
  }
  return (
    <Frame testId="screen-sleep" bg="#16153F" fg="#FFF6E5" className="flex flex-col px-6 pb-[30px]">
      {STARS.map((st, i) => (
        <span key={i} aria-hidden className="absolute rounded-full bg-cream" style={{ left: st.l, top: st.t, width: st.s, height: st.s, animation: `twinkle 2.4s ease-in-out ${st.d}s infinite both` }} />
      ))}
      {/* the sun waits under the hill */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 -ml-[75px] w-[150px] h-[150px] rounded-full bg-sun" style={{ top: '61.6%', animation: 'sunset 2.4s cubic-bezier(.4,0,.2,1) both' }} />
        <Hill color="#2B1B3A" className="-left-[120px] -right-[120px] top-[71%] h-[500px] !rounded-[50%_50%_0_0]" />
      </div>
      <div className="relative z-10 flex flex-col flex-1">
        <StepBars step={4} />
        <Eyebrow className="mt-7 text-muted-2">TONIGHT · 4 OF 4</Eyebrow>
        <h1 className="h-screen-title m-0 mt-2 text-[60px] leading-[0.92]" style={{ animation: 'fadeUp .8s ease .4s both' }}>Tomorrow is decided.</h1>
        <p className="m-0 mt-3.5 text-[17px] leading-[25px] text-muted" style={{ animation: 'fadeUp .8s ease .6s both' }}>
          Put the phone down. See you at {f.t} {f.ap}.
        </p>
        {s.pushOn && (
          <p className="m-0 mt-4 self-start inline-flex items-center gap-1.5 rounded-full border border-sun/60 px-3 py-1 text-[13px] font-semibold text-sun" role="status" data-testid="sleep-alarm-badge" style={{ animation: 'pop .5s cubic-bezier(.2,.9,.3,1.3) 1s both' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFE38A" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            Alarm set for {timeLabel(s.wakeMins)}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-1">
          <button type="button" className="chunky border-2 border-solid border-cream bg-transparent text-cream" style={{ animation: 'fadeUp .8s ease 1.4s both' }}
            onClick={goodNight}>Good night</button>
          <button type="button" className="linkish text-muted self-center" onClick={() => actions.go('plan')}>Change tomorrow’s plan</button>
        </div>
      </div>
      {dim && (
        <button type="button" aria-label="Wake the screen" onClick={() => setDim(false)} data-testid="dim"
          className="absolute inset-0 z-50 w-full h-full border-0 bg-deep text-cream flex flex-col items-center justify-center gap-3 cursor-pointer font-display" style={{ animation: 'fadeUp 1.2s ease both', ['--ring' as string]: '#FFF6E5' }}>
          <span aria-hidden className="w-[88px] h-[88px] rounded-full bg-sun" style={{ animation: 'halo 6s ease-in-out infinite' }} />
          <span className="text-[44px] leading-[0.95] font-extrabold tracking-[-0.04em]">Good night.</span>
          <span className="label text-muted-2">TAP TO WAKE THE SCREEN</span>
        </button>
      )}
    </Frame>
  )
}
