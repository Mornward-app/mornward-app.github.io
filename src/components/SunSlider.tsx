import { useRef, useState } from 'react'
import { clampWake, WAKE_MAX, WAKE_MIN, WAKE_STEP } from '../lib/store'
import { fmtMinsFull } from '../lib/dates'

/** Arc geometry in a 310 x 84 box: centre (155, 84), radius 145 across, 70 high. */
const W = 310, CX = 155, CY = 84, RX = 145, RY = 70

const toAngle = (mins: number) => Math.PI * (1 - (mins - WAKE_MIN) / (WAKE_MAX - WAKE_MIN))
/** pointer x (0..1 across the track) -> wake time, snapped to 15 minutes. The sun stays under the finger horizontally. */
export function minsFromX(frac: number) {
  const u = Math.max(-1, Math.min(1, ((frac * W) - CX) / RX))
  const t = 1 - Math.acos(u) / Math.PI
  return clampWake(WAKE_MIN + t * (WAKE_MAX - WAKE_MIN))
}

/** Draggable sun on the sky arc. Dragging, tapping the sky, arrow keys and the +/- buttons all drive the same wake time. */
export default function SunSlider({ mins, onChange }: { mins: number; onChange: (m: number) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const ang = toAngle(mins)
  const left = ((CX + RX * Math.cos(ang)) / W) * 100
  const top = CY - RY * Math.sin(ang)

  const fromEvent = (e: React.PointerEvent) => {
    const r = track.current!.getBoundingClientRect()
    onChange(minsFromX((e.clientX - r.left) / r.width))
  }
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pointer cannot be captured */ }
    setDrag(true)
    fromEvent(e)
  }
  const move = (e: React.PointerEvent<HTMLDivElement>) => { if (drag) fromEvent(e) }
  const up = () => setDrag(false)
  const key = (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? WAKE_STEP : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -WAKE_STEP
      : e.key === 'PageUp' ? 60 : e.key === 'PageDown' ? -60 : 0
    if (e.key === 'Home') { e.preventDefault(); onChange(WAKE_MIN) } else if (e.key === 'End') { e.preventDefault(); onChange(WAKE_MAX) } else if (d) { e.preventDefault(); onChange(mins + d) }
  }

  return (
    <div className="mt-1">
      <div ref={track} data-testid="sun-track" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
        className="relative h-[92px] select-none cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }}>
        <div aria-hidden className="absolute inset-x-0 top-0 h-[84px] overflow-hidden pointer-events-none">
          <span className="absolute left-[3.2%] right-[3.2%] top-[14px] h-[140px] rounded-[50%] border-2 border-dashed border-arc" />
        </div>
        <span aria-hidden className="absolute left-0 right-0 bottom-0 h-2 bg-hill-night pointer-events-none" />
        <div role="slider" tabIndex={0} aria-label="Wake time. Drag the sun, or use the arrow keys." aria-orientation="horizontal"
          aria-valuemin={WAKE_MIN} aria-valuemax={WAKE_MAX} aria-valuenow={mins} aria-valuetext={fmtMinsFull(mins)} data-testid="sun-thumb" onKeyDown={key}
          className="absolute w-11 h-11 -ml-[22px] -mt-[22px] flex items-center justify-center rounded-full outline-offset-0"
          style={{ left: `${left}%`, top, transition: drag ? 'left .08s linear, top .08s linear' : 'left .6s cubic-bezier(.34,1.3,.5,1), top .6s cubic-bezier(.34,1.3,.5,1)' }}>
          <span aria-hidden className="block w-[26px] h-[26px] rounded-full bg-sun" style={{ transform: drag ? 'scale(1.25)' : undefined, transition: 'transform .15s ease', boxShadow: `0 0 0 ${drag ? 10 : 6}px rgba(255,227,138,.22)` }} />
        </div>
      </div>
      <div aria-hidden className="mono flex justify-between text-[10px] tracking-[0.12em] text-soft mt-1.5">
        <span>5:00 AM</span><span>DRAG THE SUN</span><span>10:00 AM</span>
      </div>
    </div>
  )
}
