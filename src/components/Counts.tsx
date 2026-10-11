import { useState, useSyncExternalStore } from 'react'
import {
  agree, backfill, CONTACT, declineNotice, needsNotice, setCountsOff, statsOn, statsView, subscribeStats, TERMS_URL, trackOpen,
} from '../lib/stats'
import { getState, type ScreenId } from '../lib/store'

export const useStats = () => useSyncExternalStore(subscribeStats, statsView, statsView)

const link = 'underline underline-offset-[3px] text-cream bg-transparent border-0 p-0 font-[inherit] cursor-pointer'

/** Above Welcome's button, on a solid night backing (never over the sunrise glow): tapping the button agrees to the beta
 * terms. The counts can be turned off before that tap. */
export function ConsentLine() {
  const s = useStats()
  const off = s.noStats
  return (
    <div className="relative mb-3 rounded-[14px] bg-[#2E2D6E] px-3 py-1.5 text-[13px] leading-[19px] text-soft text-center" data-testid="consent">
      <p className="m-0">Free · No account · Continuing accepts the <a className={link} href={TERMS_URL} target="_blank" rel="noopener">beta terms</a>.</p>
      <p className="m-0 mt-0.5">Anonymous counts {off ? 'off' : 'on'} · <button type="button" className={`${link} min-h-[44px]`} data-testid="counts-toggle"
        onClick={() => setCountsOff(!off)}>{off ? 'Turn on' : 'Turn off'}</button></p>
    </div>
  )
}

/** Agree from Welcome's button, then count today's open. */
export function agreeFromWelcome() {
  agree('welcome')
  const s = getState()
  trackOpen(s.screen, s.onboarded)
}

const NO_NOTICE: ScreenId[] = ['welcome', 'breathe', 'act']

/**
 * People who set up before counts existed: asked once, on a calm screen (never mid-ritual). Nothing is sent until
 * they answer OK; then today's open and the one-time catch-up of their finished mornings go.
 */
export function CountsNotice({ screen }: { screen: ScreenId }) {
  useStats()
  const s = getState()
  const existing = s.onboarded || s.history.length > 0
  if (!existing || !needsNotice() || NO_NOTICE.includes(screen)) return null
  const ok = () => {
    agree('notice')
    const now = getState()
    trackOpen(now.screen, now.onboarded)
    backfill(now.history, now.onboarded)
  }
  return (
    <Sheet testId="counts-notice" title="Mornward now counts a few things">
      <p className="m-0 text-[16px] leading-[24px] text-soft">
        Anonymous counts, like which mornings you finish, show whether Mornward helps. Never your tasks, your note or your times. No account.
      </p>
      <a className={`${link} text-[15px] self-start min-h-[44px] inline-flex items-center`} href={TERMS_URL} target="_blank" rel="noopener">What’s counted</a>
      <button type="button" className="chunky chunky-butter" data-testid="counts-ok" onClick={ok}>OK</button>
      <button type="button" className="linkish text-soft self-center" data-testid="counts-decline" onClick={declineNotice}>Turn off counts</button>
    </Sheet>
  )
}

/** Rest screen: the counts switch, the anonymous ID (to ask for its data to be shown or deleted) and the terms. */
export function PrivacyLink() {
  const [open, setOpen] = useState(false)
  const s = useStats()
  const on = statsOn()
  return (
    <>
      <button type="button" className="linkish text-soft self-center text-[14px]" data-testid="privacy-open" onClick={() => setOpen(true)}>Privacy and counts</button>
      {open && (
        <Sheet testId="privacy-sheet" title="Privacy and counts">
          <p className="m-0 text-[16px] leading-[24px] text-soft">Your tasks, your note and your times stay on this phone. Only anonymous counts are sent, and only while they are on.</p>
          <p className="m-0 text-[16px] font-semibold" data-testid="privacy-state">Anonymous counts {on ? 'on' : 'off'}</p>
          <button type="button" className="chunky border-2 border-solid border-cream bg-transparent text-cream" data-testid="privacy-toggle"
            onClick={() => { if (on) setCountsOff(true); else { agree('privacy'); setCountsOff(false) } }}>{on ? 'Turn off counts' : 'Turn on counts'}</button>
          {s.deviceId && (
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-[14px] text-soft">Your anonymous ID</p>
              <code className="block rounded-[12px] bg-hill-night px-3 py-2.5 text-[13px] text-cream break-all select-text font-jbmono" data-testid="privacy-id">{s.deviceId}</code>
              <p className="m-0 text-[14px] leading-[20px] text-soft">To see or delete the counts sent with it, email it to {CONTACT}.</p>
            </div>
          )}
          <a className={`${link} text-[15px] self-start min-h-[44px] inline-flex items-center`} href={TERMS_URL} target="_blank" rel="noopener">Terms and privacy</a>
          <button type="button" className="chunky chunky-butter" onClick={() => setOpen(false)}>Done</button>
        </Sheet>
      )}
    </>
  )
}

function Sheet({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" data-testid={testId} role="dialog" aria-modal="true" aria-labelledby={`${testId}-t`}>
      <div aria-hidden className="absolute inset-0 bg-[#0B0A24]/70" />
      <div className="relative mx-auto w-full max-w-[430px] rounded-t-[28px] bg-deep text-cream px-6 pt-6 flex flex-col gap-3 font-display"
        style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', animation: 'fadeUp .4s ease both' }}>
        <h2 id={`${testId}-t`} className="m-0 text-[26px] leading-[1.05] font-extrabold tracking-[-0.02em]">{title}</h2>
        {children}
      </div>
    </div>
  )
}
