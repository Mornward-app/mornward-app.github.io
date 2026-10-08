import { actions, useStore } from '../lib/store'
import { fmtMins } from '../lib/dates'
import { Eyebrow, Frame, Hill, StepBars } from '../components/ui'

const STARS = [{ l: 60, t: 230, s: 4, d: 1 }, { l: 300, t: 280, s: 3, d: 1.6 }, { l: 200, t: 200, s: 3, d: 2.1 }, { l: 110, t: 330, s: 3, d: 0.6 }, { l: 335, t: 190, s: 2, d: 1.2 }]

export default function OnbSleep() {
  const s = useStore()
  const f = fmtMins(s.wakeMins)
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
        <div className="mt-auto flex flex-col gap-1">
          <button type="button" className="chunky border-2 border-solid border-cream bg-transparent text-cream" style={{ animation: 'fadeUp .8s ease 1.4s both' }}
            onClick={() => { actions.finishOnboarding(); actions.go('wake') }}>Good night</button>
          <button type="button" className="linkish text-muted self-center" onClick={() => actions.go('plan')}>Change tomorrow’s plan</button>
        </div>
      </div>
    </Frame>
  )
}
