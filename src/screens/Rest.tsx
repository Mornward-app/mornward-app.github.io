import { actions } from '../lib/store'
import { haptic } from '../lib/native'
import { Frame } from '../components/ui'
import { Hill } from '../components/ui'
import { PrivacyLink } from '../components/Counts'

const STARS = [{ l: 60, t: 24, s: 3, d: 1 }, { l: 300, t: 40, s: 3, d: 1.6 }, { l: 200, t: 18, s: 2, d: 2.1 }, { l: 110, t: 52, s: 2, d: 0.6 }, { l: 335, t: 20, s: 2, d: 1.2 }] // above the headline, never behind words

/** "See you tonight": the day is done. The way forward is planning tomorrow, not looping back to this card. */
export default function Rest() {
  return (
    <Frame testId="screen-rest" bg="#16153F" fg="#FFF6E5" className="flex flex-col px-6 pb-[30px]">
      {STARS.map((st, i) => (
        <span key={i} aria-hidden className="absolute rounded-full bg-cream" style={{ left: st.l, top: st.t, width: st.s, height: st.s, animation: `twinkle 2.4s ease-in-out ${st.d}s infinite both` }} />
      ))}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 -ml-[75px] w-[150px] h-[150px] rounded-full bg-sun" style={{ top: '60%', animation: 'halo 6s ease-in-out infinite' }} />
        <Hill color="#2B1B3A" className="-left-[120px] -right-[120px] top-[70%] h-[500px] !rounded-[50%_50%_0_0]" />
      </div>
      <div className="relative z-10 flex flex-col flex-1">
        <h1 className="m-0 mt-[14vh] text-[60px] leading-[0.92] font-extrabold tracking-[-0.04em]" style={{ animation: 'fadeUp .8s ease .1s both' }}>See you tonight.</h1>
        <p className="m-0 mt-3.5 text-[17px] leading-[25px] text-soft" style={{ animation: 'fadeUp .8s ease .3s both' }}>
          Your morning is kept. Tomorrow starts tonight.
        </p>
        <div className="mt-auto flex flex-col gap-1">
          <button type="button" className="chunky chunky-butter" data-testid="plan-tomorrow" style={{ animation: 'pop .6s cubic-bezier(.2,.9,.3,1.2) .6s both' }}
            onClick={() => { haptic('light'); actions.startEvening() }}>Plan tomorrow's morning</button>
          <button type="button" className="linkish text-soft self-center" onClick={() => actions.go('down')}>Back to today's card</button>
          <PrivacyLink />
        </div>
      </div>
    </Frame>
  )
}
