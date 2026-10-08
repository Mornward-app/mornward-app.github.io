import { useRef } from 'react'
import { actions, useStore } from '../lib/store'
import { haptic } from '../lib/native'
import { clock } from '../lib/dates'
import tokens from '../tokens.json'
import { Frame, Hill, TickIcon } from '../components/ui'

const WHERE = ['STILL DOWN', 'PEEKING', 'RISING', 'UP']
const SUN_TOP = [720, 560, 400, 210].map((v) => (v / 844) * 100)
const HALO = [0, 0.18, 0.28, 0.4]

/** step = round(done / total * 3): finishing all chosen tasks (1 to 3) always reaches morning. */
export const skyStep = (done: number, total: number) => (total === 0 ? 3 : Math.round((done / total) * 3))

export default function Act() {
  const s = useStore()
  const total = s.picked.length
  const done = s.day.ticked.filter(Boolean).length
  const step = skyStep(done, total)
  const all = total > 0 && done === total
  const mountTime = useRef(clock()).current

  return (
    <Frame testId="screen-act" bg={tokens.sky[step]} fg={tokens.skyText[step]} className="flex flex-col px-5" style={{ ['--ring' as string]: '#2B1B3A', transitionDuration: '1100ms' }}>
      {/* Rising Sun Layering: the sun lives in a background layer (z-0, no pointer events) strictly behind the z-10 content */}
      <div data-testid="sun-layer" className="absolute inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 w-[240px] h-[240px] -ml-[120px]" data-testid="sun" style={{ top: `${SUN_TOP[step]}%`, transition: 'top 1.3s cubic-bezier(.34,1.4,.5,1)' }}>
          <span className="absolute -inset-[30px] rounded-full bg-sun" style={{ opacity: HALO[step], transition: 'opacity 1s ease' }} />
          {step === 1 && <span key="b1" className="absolute inset-0 rounded-full border-4 border-sun" style={{ animation: 'burst 1s ease-out both' }} />}
          {step === 2 && <span key="b2" className="absolute inset-0 rounded-full border-4 border-cream" style={{ animation: 'burst 1s ease-out both' }} />}
          {step === 3 && <span key="b3" className="absolute inset-0 rounded-full border-[6px] border-white" style={{ animation: 'burst 1.2s ease-out both' }} />}
          <span className="absolute inset-0 rounded-full bg-sun" />
        </div>
        <Hill color={tokens.hill[step]} className="-left-[100px] -right-[100px] top-[86.5%] h-[400px]" />
      </div>

      <div data-testid="act-content" className="relative z-10 flex flex-col flex-1">
        <p className="label m-0 mt-[30px]" style={{ animation: 'fadeUp .6s ease both' }} data-testid="act-status">{mountTime} · {done} OF {total} · THE SUN IS {WHERE[step]}</p>
        <h1 className="m-0 mt-2 text-[46px] leading-[0.96] font-extrabold tracking-[-0.035em]" style={{ animation: 'fadeUp .6s ease .08s both' }}>Do it for real.<br />Then tap it.</h1>

        <ul className="m-0 mt-[23.7vh] p-0 list-none flex flex-col gap-3">
          {s.picked.map((label, i) => {
            const on = s.day.ticked[i]
            return (
              <li key={label} style={{ animation: `fadeUp .6s cubic-bezier(.2,.8,.2,1) ${0.15 + i * 0.08}s both` }}>
                <button type="button" aria-pressed={on} data-testid={`task-${i}`}
                  onClick={() => { haptic('light'); actions.tick(i) }}
                  className="w-full min-h-[70px] border-0 rounded-chunk px-[18px] flex items-center gap-3.5 cursor-pointer font-display text-ink"
                  style={{
                    background: on ? '#FFE38A' : '#FFF6E5', boxShadow: `0 ${on ? 2 : 6}px 0 ${on ? '#D9B94E' : '#C9B9A0'}`,
                    transition: 'transform .14s cubic-bezier(.3,.7,.4,1), box-shadow .14s, background .4s ease', transform: on ? 'translateY(4px)' : undefined,
                  }}>
                  <span className="mono text-xs text-label-2">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1 text-left relative text-[22px] font-extrabold tracking-[-0.01em] min-w-0">
                    <span className="transition-opacity duration-[400ms]" style={{ opacity: on ? 0.55 : 1 }}>{label}</span>
                    <span aria-hidden className="absolute left-0 top-[52%] h-[2.5px] bg-ink rounded-sm" style={{ width: on ? '100%' : '0%', transition: 'width .45s cubic-bezier(.6,0,.2,1)' }} />
                  </span>
                  <span aria-hidden className="w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-300" style={{ background: on ? '#2B1B3A' : '#E6DDF2' }}>
                    {on && <TickIcon />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-auto mb-[30px] min-h-[66px]">
          {all
            ? <button type="button" className="chunky chunky-ink" style={{ animation: 'pop .7s cubic-bezier(.2,.9,.3,1.2) .5s both' }} onClick={() => actions.go('down')}>Sun’s up. Open today’s card</button>
            : <p className="m-0 text-base leading-[23px] font-semibold text-center">Phone down. Do the first one. Come back.</p>}
        </div>
      </div>
    </Frame>
  )
}
