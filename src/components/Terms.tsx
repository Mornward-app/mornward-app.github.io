import { TERMS_URL } from '../lib/links'

const link = 'underline underline-offset-[3px] text-cream bg-transparent border-0 p-0 font-[inherit] cursor-pointer'

/** Above Welcome's button, on a solid night backing (never over the sunrise glow). Continuing accepts the terms. */
export function TermsLine() {
  return (
    <p className="relative mb-3 m-0 rounded-[14px] bg-[#2E2D6E] px-3 py-2 text-[13px] leading-[19px] text-soft text-center" data-testid="terms-line">
      Free · No account · Nothing leaves your phone.<br />
      Continuing accepts the <a className={link} href={TERMS_URL} target="_blank" rel="noopener">terms and privacy</a>.
    </p>
  )
}

/** A quiet link for the "See you tonight" screen. */
export function TermsLink() {
  return (
    <a className="min-h-[44px] self-center inline-flex items-center justify-center text-[14px] text-soft underline underline-offset-4" href={TERMS_URL} target="_blank" rel="noopener" data-testid="terms-link">
      Terms and privacy
    </a>
  )
}
