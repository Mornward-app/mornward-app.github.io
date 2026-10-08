import { actions, useStore } from '../lib/store'
import { fmtMins, MONTH, DAYNAME } from '../lib/dates'
import { notifBody } from '../lib/copy'
import { Frame, Hill } from '../components/ui'

export default function Wake() {
  const s = useStore()
  const f = fmtMins(s.wakeMins)
  const now = new Date()
  return (
    <Frame testId="screen-wake" bg="#1E1D52" fg="#FFF6E5" className="flex flex-col items-center">
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[420px] z-0 pointer-events-none" style={{ animation: 'sunUp 2.6s cubic-bezier(.2,.8,.2,1) both' }}>
        <div className="absolute left-1/2 bottom-10 w-[440px] h-[440px] -ml-[220px] rounded-full bg-[#3A2F78]" style={{ animation: 'halo 6s ease-in-out 2.6s infinite' }} />
        <div className="absolute left-1/2 bottom-[90px] w-[300px] h-[300px] -ml-[150px] rounded-full bg-plum" />
        <div className="absolute left-1/2 bottom-[140px] w-[190px] h-[190px] -ml-[95px] rounded-full bg-sun" />
      </div>
      <Hill color="#E8735A" className="-left-[120px] -right-[120px] -bottom-[520px] h-[760px]" />
      <Hill color="#2B2A6B" className="-left-[140px] -right-[140px] -bottom-[600px] h-[760px]" />

      <div className="relative z-10 flex flex-col items-center w-full px-4">
        <p className="m-0 mt-[72px] text-[17px] font-semibold text-muted" style={{ animation: 'fadeUp .8s ease both' }}>{DAYNAME[now.getDay()]}, {MONTH[now.getMonth()]} {now.getDate()}</p>
        <p className="m-0 text-[104px] leading-none font-semibold tracking-[-0.04em]" data-testid="wake-clock" style={{ animation: 'fadeUp .8s ease .1s both' }}>{f.t}</p>

        <div className="mt-[30px] w-full max-w-[358px] flex flex-col gap-2">
          <div className="bg-cream text-ink rounded-3xl px-4 py-3.5 flex gap-3 items-start" style={{ boxShadow: '0 6px 0 #C9B9A0', animation: 'drop .9s cubic-bezier(.2,.9,.3,1.2) 1.1s both' }}>
            <span aria-hidden className="flex-none w-10 h-10 rounded-[11px] bg-night relative overflow-hidden">
              <span className="absolute left-[9px] top-3 w-[22px] h-[22px] rounded-full bg-sun" />
              <span className="absolute -left-1.5 -right-1.5 top-[26px] h-[30px] rounded-[50%] bg-coral" />
            </span>
            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
              <div className="flex justify-between"><span className="mono text-[11px] tracking-[0.1em] text-label-2">MORNWARD</span><span className="text-[13px] text-label-2">now</span></div>
              <span className="text-[17px] font-extrabold">Before the feed.</span>
              <span className="text-[15px] leading-5 text-label">{notifBody(s.picked)}</span>
            </div>
          </div>
          <div className="bg-night rounded-[20px] px-4 py-3 text-sm leading-[19px] text-muted" style={{ animation: 'fadeUp .7s ease 1.7s both' }} data-testid="wake-pact">
            Last night, you wrote:<br />
            <span className="text-base font-semibold text-cream">“{s.pact || 'I want my mornings to feel like mine again.'}”</span>
          </div>
        </div>
      </div>

      <button type="button" aria-label="Tap to begin" onClick={() => actions.go('breathe')} className="absolute inset-0 z-20 w-full h-full border-0 bg-transparent cursor-pointer" style={{ ['--ring' as string]: '#FFF6E5' }} />
      <p aria-hidden className="mono z-10 absolute bottom-11 m-0 text-[11px] tracking-[0.18em] text-cream" style={{ animation: 'breatheOp 2.4s ease-in-out 2s infinite both' }}>TAP TO BEGIN</p>
    </Frame>
  )
}
