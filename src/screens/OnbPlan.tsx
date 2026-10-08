import { useRef, useState } from 'react'
import { actions, lastUnpickedStarter, MAX_CUSTOM, MAX_TASKS, STARTER_TASKS, useStore } from '../lib/store'
import { haptic } from '../lib/native'
import { Eyebrow, Frame, StepBars, TickIcon } from '../components/ui'

export default function OnbPlan() {
  const s = useStore()
  const [bumps, setBumps] = useState(0)
  const [draft, setDraft] = useState('')
  const [vanishing, setVanishing] = useState<string | null>(null)
  const busy = useRef(false)

  const starters = STARTER_TASKS.filter((t) => !s.hidden.includes(t))
  const chips = [...starters, ...s.custom]
  const full = s.custom.length >= MAX_CUSTOM

  const toggle = (label: string) => {
    haptic('light')
    if (actions.togglePick(label) === 'limit') setBumps((b) => b + 1)
    else setBumps(0)
  }

  const add = () => {
    if (busy.current || !draft.trim() || full) return
    const text = draft
    const lower = text.trim().toLowerCase()
    if ([...STARTER_TASKS, ...s.custom].some((x) => x.toLowerCase() === lower)) { setDraft(''); return }
    busy.current = true
    const leaving = lastUnpickedStarter(s)
    setVanishing(leaving)
    haptic('light')
    window.setTimeout(() => {
      const willPick = s.picked.length < MAX_TASKS
      actions.addCustom(text)
      if (!willPick) setBumps((b) => b + 1)
      setDraft('')
      setVanishing(null)
      busy.current = false
    }, leaving ? 460 : 0)
  }

  return (
    <Frame testId="screen-plan" bg="#2B2A6B" fg="#FFF6E5" className="flex flex-col px-6 pb-[30px]">
      <StepBars step={1} />
      <Eyebrow className="mt-7 text-muted-2" style={{ animation: 'fadeUp .6s ease both' }}>TONIGHT · 1 OF 4</Eyebrow>
      <h1 className="h-screen-title m-0 mt-2 text-[48px]" style={{ animation: 'fadeUp .6s ease .08s both' }}>What will you do before the feed?</h1>

      <div className="mt-3 min-h-[22px]" aria-live="polite">
        {bumps === 0
          ? <p className="m-0 text-[15px] font-semibold text-muted">{s.picked.length} of 3 · small and real</p>
          : <p key={bumps} className="m-0 text-[15px] font-semibold text-sun" style={{ animation: 'nope .45s ease both' }}>3 is the limit. Swap one out.</p>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Tomorrow's tasks">
        {chips.map((label, i) => {
          const on = s.picked.includes(label)
          return (
            <button key={label} type="button" aria-pressed={on} onClick={() => toggle(label)}
              className="min-h-[48px] pl-3 pr-4 rounded-full border-2 font-display text-base font-extrabold inline-flex items-center gap-2 cursor-pointer transition-[transform,background-color,color,border-color] duration-200 active:scale-95"
              style={{
                borderColor: on ? '#FFE38A' : '#9896D8', background: on ? '#FFE38A' : 'transparent', color: on ? '#2B1B3A' : '#FFF6E5',
                animation: vanishing === label ? 'vanish .46s ease forwards' : `fadeUp .5s ease ${0.2 + i * 0.05}s both`,
              }}>
              <span aria-hidden className="w-[22px] h-[22px] rounded-full flex items-center justify-center" style={{ background: on ? '#2B1B3A' : '#3D3C86' }}>
                {on && <TickIcon size={14} width={3.4} duration=".35s" delay="0s" />}
              </span>
              {label}
            </button>
          )
        })}
      </div>

      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
        <label htmlFor="own-task" className="sr-only">Write your own tiny task</label>
        <input id="own-task" value={draft} maxLength={32} disabled={full} autoComplete="off" enterKeyHint="done"
          onChange={(e) => setDraft(e.target.value)}
          placeholder={full ? 'Your own tasks are in' : '+ Write your own tiny task...'}
          className="flex-1 min-w-0 min-h-[48px] rounded-full border-2 border-dashed border-line bg-transparent px-4 font-display text-base font-semibold text-cream placeholder:text-soft disabled:opacity-70 select-text" />
        {draft.trim() && !full && (
          <button type="submit" aria-label="Add this task" className="w-12 h-12 rounded-full border-0 bg-cream text-ink text-2xl font-extrabold cursor-pointer transition-transform active:scale-90" style={{ animation: 'pop .35s cubic-bezier(.2,.9,.3,1.3) both' }}>+</button>
        )}
      </form>
      <p className="m-0 mt-2 text-[13px] text-soft">Up to {MAX_CUSTOM} of your own. Stays on this phone.</p>

      <div className="mt-auto pt-4">
        <button type="button" className="chunky chunky-butter" aria-disabled={s.picked.length === 0}
          style={{ opacity: s.picked.length ? 1 : 0.45 }}
          onClick={() => { if (s.picked.length) actions.go('pact') }}>Next: your pact</button>
      </div>
    </Frame>
  )
}
