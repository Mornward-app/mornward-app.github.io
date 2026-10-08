import { actions } from '../lib/store'
import { haptic } from '../lib/native'
import { Frame } from '../components/ui'

const STEPS = [
  { label: '01 · TONIGHT (45s)', text: 'Pick 3 tiny off-screen moves & leave a 1-line note for 7am you.' },
  { label: '02 · AT WAKE-UP', text: 'Hold the sun for 3 slow breaths, then check off your 3 moves to lift the sun.' },
  { label: '03 · SCREEN OFF', text: 'Unseal 1 daily science card, then put your phone down.' },
]
// kept in the strip above the text so no star ever sits behind a word
const STARS = [
  { l: 10, t: 1.6, s: 2, d: 0.2 }, { l: 24, t: 2.6, s: 2, d: 1.1 }, { l: 40, t: 1.4, s: 3, d: 1.8 }, { l: 66, t: 3.6, s: 2, d: 2.4 },
  { l: 78, t: 2, s: 3, d: 0.7 }, { l: 88, t: 4, s: 2, d: 1.5 }, { l: 94, t: 1.5, s: 2, d: 2.9 }, { l: 52, t: 2.8, s: 2, d: 0.4 },
]

/** Full-bleed pre-dawn sky: gradient, stars and a blurred sun that rises past the bottom edge, so no seam shows. */
const Sky = (
  <>
    <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #25245C 0%, #2E2D6E 55%, #523E7C 100%)' }} />
    {STARS.map((st, i) => (
      <span key={i} className="absolute rounded-full bg-cream"
        style={{ left: `${st.l}%`, top: `${st.t}%`, width: st.s, height: st.s, animation: `twinkle 3s ease-in-out ${st.d}s infinite both` }} />
    ))}
    {/* wide warm haze along the horizon */}
    <div className="absolute inset-x-0 bottom-0 h-[46%]"
      style={{ background: 'radial-gradient(ellipse 95% 100% at 50% 100%, rgba(255,150,90,.42) 0%, rgba(232,115,90,.2) 45%, rgba(232,115,90,0) 78%)' }} />
    {/* the blurred sun: centred below the screen edge, so its top half glows up into the page */}
    <div className="absolute left-1/2 -ml-[240px] w-[480px] h-[480px] rounded-full -bottom-[290px]"
      style={{ background: 'radial-gradient(circle, rgba(255,233,168,.95) 0%, rgba(255,181,71,.8) 30%, rgba(255,140,90,.5) 52%, rgba(232,115,90,0) 72%)', filter: 'blur(14px)', animation: 'halo 7s ease-in-out infinite' }} />
  </>
)

/** First screen for a new user: what Mornward is, before Step 1 of 4. */
export default function Welcome() {
  return (
    <Frame testId="screen-welcome" bg="#2E2D6E" fg="#FFF6E5" sky={Sky} className="flex flex-col px-6 pb-[30px] font-jakarta">
      <div className="relative z-10 flex flex-col flex-1">
        <p className="font-jbmono text-[11px] tracking-[0.18em] uppercase m-0 mt-6 text-soft" style={{ animation: 'fadeUp .6s ease both' }}>MORNWARD · DAYBREAK</p>
        <h1 className="font-serif font-normal m-0 mt-3 text-[clamp(38px,11.5vw,48px)] leading-[1.02] tracking-[-0.01em]" style={{ animation: 'fadeUp .7s ease .08s both' }}>
          Your morning belongs to you — <em className="italic" style={{ color: '#FFE9A8' }}>not the feed.</em>
        </h1>
        <p className="m-0 mt-3.5 text-[16px] leading-[24px] text-soft" style={{ animation: 'fadeUp .7s ease .16s both' }}>
          A 4-minute sunrise ritual that stands between your alarm and your first scroll.
        </p>

        <ol className="m-0 mt-[clamp(18px,3.2vh,30px)] p-0 list-none flex flex-col gap-[clamp(10px,2vh,18px)]" aria-label="How it works">
          {STEPS.map((st, i) => (
            <li key={st.label} className="flex flex-col gap-1 pl-4 border-l-2 border-[#FFB547]/60" style={{ animation: `fadeUp .6s ease ${0.3 + i * 0.12}s both` }}>
              <span className="font-jbmono text-[11px] tracking-[0.14em] uppercase font-medium" style={{ color: '#FFE9A8' }}>{st.label}</span>
              <span className="text-[15px] leading-[21px] text-muted">{st.text}</span>
            </li>
          ))}
        </ol>

        <div className="mt-auto pt-5">
          <button type="button" onClick={() => { haptic('light'); actions.go('plan') }}
            className="chunky chunky-amber font-jakarta" style={{ animation: 'pop .6s cubic-bezier(.2,.9,.3,1.2) .8s both' }}>
            Begin tonight's setup (45s) →
          </button>
        </div>
      </div>
    </Frame>
  )
}
