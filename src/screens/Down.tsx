import { useEffect, useRef, useState } from 'react'
import { actions, useStore } from '../lib/store'
import { CARDS } from '../lib/cards'
import { haptic, putPhoneDown } from '../lib/native'
import { clock, DAYNAME, WEEKDAY, weekKeys } from '../lib/dates'
import { Frame } from '../components/ui'

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function Down() {
  const s = useStore()
  const card = CARDS[s.day.cardIdx]
  const [stage, setStage] = useState<'sealed' | 'shaking' | 'open'>(s.day.cardOpened ? 'open' : 'sealed')
  const wasOpen = useRef(s.day.cardOpened)
  const [deck, setDeck] = useState(false)
  const [resting, setResting] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const open = () => {
    if (stage !== 'sealed') return
    setStage('shaking')
    haptic('medium')
    timer.current = window.setTimeout(() => { setStage('open'); actions.openCard(); haptic('light') }, 900)
  }

  const now = new Date()
  const week = weekKeys(now)
  const kept = week.map((k) => s.history.includes(k))
  const keptNames = week.map((_, i) => (kept[i] ? DAYNAME[(i + 1) % 7] : null)).filter(Boolean).join(', ')
  const todayKey = week.findIndex((k) => k === s.day.date)
  const doneCount = s.day.ticked.filter(Boolean).length

  const down = async () => {
    haptic('success')
    await putPhoneDown()
    setResting(true)
  }

  return (
    <Frame testId="screen-down" bg="#FFE9A8" fg="#2B1B3A" className="flex flex-col px-5" style={{ ['--ring' as string]: '#2B1B3A' }}>
      <div aria-hidden className="absolute left-1/2 -top-[170px] w-[400px] h-[400px] -ml-[200px] z-0 pointer-events-none" style={{ animation: 'float 6s ease-in-out infinite' }}>
        <span className="absolute inset-0 rounded-full bg-sun-pale" />
        <span className="absolute inset-[60px] rounded-full bg-sun-deep" />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        <button type="button" onClick={() => setDeck(true)} className="absolute right-0 top-4 z-10 min-h-[44px] px-3.5 rounded-full border-2 border-ink bg-transparent text-ink font-display text-sm font-extrabold cursor-pointer" data-testid="open-deck">
          Deck {s.opened.length}/{CARDS.length}
        </button>
        <p className="label m-0 mt-[clamp(40px,9vh,196px)] text-label" style={{ animation: 'fadeUp .6s ease both' }} data-testid="down-meta">{clock(now)} · {WEEKDAY[now.getDay()]} · MORNING KEPT</p>
        <h1 className="m-0 mt-1.5 text-[58px] [@media(max-height:700px)]:text-[44px] leading-[0.9] font-extrabold tracking-[-0.04em]" style={{ animation: 'fadeUp .7s cubic-bezier(.2,.8,.2,1) .1s both' }}>Phone down.<br />Good morning.</h1>
        <div className="mt-3.5 flex gap-2 flex-wrap">
          <span className="px-3.5 py-2 rounded-full bg-ink text-cream text-[15px] font-semibold" style={{ animation: 'pop .5s cubic-bezier(.2,.9,.3,1.3) .35s both' }}>{doneCount} {doneCount === 1 ? 'thing' : 'things'} done</span>
          <span className="px-3.5 py-2 rounded-full bg-coral text-ink text-[15px] font-semibold" style={{ animation: 'pop .5s cubic-bezier(.2,.9,.3,1.3) .45s both' }}>before any feed</span>
        </div>

        <div className="relative mt-5 h-[230px] flex-none [@media(max-height:700px)]:h-[200px]">
          {stage !== 'open' && (
            <button type="button" onClick={open} aria-label="Today's card. Tap to open." data-testid="mystery-card"
              className="absolute inset-0 w-full border-0 rounded-[26px] bg-plum text-cream font-display cursor-pointer overflow-hidden"
              style={{ boxShadow: '0 7px 0 #4A2A56', transformOrigin: '50% 80%', animation: stage === 'shaking' ? 'shake .95s cubic-bezier(.36,.07,.19,.97) both' : 'wobble 3.2s ease-in-out 1.2s infinite' }}>
              <span aria-hidden className="absolute left-[30px] top-[34px] w-2 h-2 rounded-full bg-sun" style={{ animation: 'twinkle 1.8s ease-in-out infinite' }} />
              <span aria-hidden className="absolute right-11 top-[54px] w-1.5 h-1.5 rounded-full bg-sun" style={{ animation: 'twinkle 1.8s ease-in-out .6s infinite' }} />
              <span aria-hidden className="absolute right-20 bottom-[50px] w-[7px] h-[7px] rounded-full bg-sun" style={{ animation: 'twinkle 1.8s ease-in-out 1.2s infinite' }} />
              <span className="flex flex-col items-center justify-center h-full gap-1">
                <span aria-hidden className="text-[104px] leading-[0.9] font-extrabold text-sun">?</span>
                <span className="text-lg font-extrabold">Today’s card</span>
                <span className="mono text-[11px] tracking-[0.14em] text-plum-text">{stage === 'shaking' ? 'OPENING…' : 'TAP TO OPEN'}</span>
              </span>
            </button>
          )}
          {stage === 'open' && (
            <>
              {!wasOpen.current && [['#E8735A', 10, 's1', 0], ['#FFC23D', 12, 's2', 0.05], ['#6B3F7A', 8, 's3', 0.1], ['#2B1B3A', 10, 's4', 0.08]].map(([c, z, a, d]) => (
                <span key={String(a)} aria-hidden className="absolute left-1/2 top-1/2 rounded-full" style={{ width: z as number, height: z as number, background: c as string, animation: `${a} .9s ease-out ${d}s both` }} />
              ))}
              <article data-testid="card-open" className="absolute inset-0 rounded-[26px] bg-cream p-5 [@media(max-height:700px)]:p-4 flex flex-col gap-2 overflow-hidden" style={{ boxShadow: '0 7px 0 #C9B9A0', animation: wasOpen.current ? undefined : 'flipIn .8s cubic-bezier(.2,.8,.2,1) both' }}>
                <p className="label m-0 text-ember">TODAY’S CARD · UNLOCKED</p>
                <h2 className="m-0 text-[26px] [@media(max-height:700px)]:text-[21px] leading-[1.02] font-extrabold tracking-[-0.02em]">{card.q}</h2>
                <p className="m-0 text-base [@media(max-height:700px)]:text-sm leading-[22px] [@media(max-height:700px)]:leading-[18px] text-label">{card.a}</p>
                <p className="m-0 mt-auto text-xs leading-4 text-label" data-testid="card-source">{card.src}</p>
              </article>
            </>
          )}
        </div>

        <div className="mt-auto pt-3 mb-[30px] flex flex-col gap-3">
          <div>
            <p className="m-0 mb-2.5 text-[15px] font-semibold">Your sunrises this week</p>
            <div className="flex gap-2 justify-between" role="img" aria-label={`This week: ${keptNames || 'no mornings kept yet'}`} data-testid="week">
              {week.map((k, i) => (
                <span key={k} className="flex flex-col items-center gap-1">
                  <span data-kept={kept[i]} className="w-[38px] h-[38px] rounded-full box-border" style={{ background: kept[i] ? '#FFC23D' : 'transparent', border: `2px ${kept[i] ? 'solid #2B1B3A' : 'dashed #8C6A1A'}`, animation: `pop .45s cubic-bezier(.2,.9,.3,1.3) ${0.6 + i * 0.06}s both`, boxShadow: i === todayKey && !kept[i] ? '0 0 0 3px #FFE9A8, 0 0 0 5px #2B1B3A' : undefined }} />
                  <span className="mono text-[10px] text-label">{LETTERS[i]}</span>
                </span>
              ))}
            </div>
          </div>
          <button type="button" className="chunky chunky-ink" onClick={down} data-testid="phone-down">Put the phone down</button>
        </div>
      </div>

      {deck && <Deck onClose={() => setDeck(false)} todayIdx={s.day.cardIdx} opened={s.opened} />}

      {resting && (
        <button type="button" aria-label="Wake the screen" onClick={() => setResting(false)} data-testid="resting"
          className="absolute inset-0 z-50 w-full h-full border-0 bg-deep text-cream flex flex-col items-center justify-center gap-3 cursor-pointer font-display" style={{ animation: 'fadeUp 1.2s ease both', ['--ring' as string]: '#FFF6E5' }}>
          <span aria-hidden className="w-[88px] h-[88px] rounded-full bg-sun" style={{ animation: 'halo 6s ease-in-out infinite' }} />
          <span className="text-[44px] leading-[0.95] font-extrabold tracking-[-0.04em]">See you tonight.</span>
          <span className="label text-muted-2">TAP TO WAKE THE SCREEN</span>
        </button>
      )}
    </Frame>
  )
}

function Deck({ onClose, opened, todayIdx }: { onClose: () => void; opened: number[]; todayIdx: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const card = sel !== null ? CARDS[sel] : null
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-ink/60" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Science Mystery Deck" data-testid="deck"
        onClick={(e) => e.stopPropagation()}
        className="bg-cream text-ink rounded-t-[28px] max-h-[88%] flex flex-col" style={{ animation: 'sheetUp .45s cubic-bezier(.2,.8,.2,1) both', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <header className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <p className="label m-0 text-ember">SCIENCE MYSTERY DECK</p>
            <h2 className="m-0 mt-1 text-[28px] leading-none font-extrabold tracking-[-0.03em]" data-testid="deck-count">{opened.length} of {CARDS.length} opened</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-full border-2 border-ink bg-transparent text-ink font-display text-[15px] font-extrabold cursor-pointer">Close</button>
        </header>
        <div className="overflow-y-auto px-5 pb-5">
          {card && sel !== null && (
            <article className="mb-3 rounded-[22px] bg-morning p-4" data-testid="deck-detail">
              <p className="label m-0 text-label">CARD {String(sel + 1).padStart(2, '0')}</p>
              <h3 className="m-0 mt-1 text-[22px] leading-[1.05] font-extrabold tracking-[-0.02em]">{card.q}</h3>
              <p className="m-0 mt-2 text-base leading-[22px] text-label">{card.a}</p>
              <p className="m-0 mt-2 text-xs leading-4 text-label">{card.src}</p>
            </article>
          )}
          <ul className="m-0 p-0 list-none grid grid-cols-3 gap-2.5">
            {CARDS.map((c, i) => {
              const isOpen = opened.includes(i)
              return (
                <li key={i}>
                  {isOpen ? (
                    <button type="button" onClick={() => setSel(sel === i ? null : i)} data-testid={`deck-card-${i}`} data-open="true" aria-pressed={sel === i}
                      className="w-full h-[104px] rounded-[18px] border-0 bg-sun text-ink p-2.5 text-left flex flex-col justify-between cursor-pointer font-display" style={{ boxShadow: '0 4px 0 #D9B94E' }}>
                      <span className="mono text-[10px] text-label">{String(i + 1).padStart(2, '0')}</span>
                      <span className="text-[13px] leading-[1.1] font-extrabold line-clamp-3">{c.q}</span>
                    </button>
                  ) : (
                    <div data-testid={`deck-card-${i}`} data-open="false" aria-label={`Card ${i + 1}, sealed${i === todayIdx ? ', today' : ''}`} role="img"
                      className="w-full h-[104px] rounded-[18px] bg-plum text-sun flex flex-col items-center justify-center" style={{ boxShadow: '0 4px 0 #4A2A56' }}>
                      <span aria-hidden className="text-[44px] leading-none font-extrabold">?</span>
                      <span className="mono text-[10px] text-plum-text">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </section>
    </div>
  )
}
