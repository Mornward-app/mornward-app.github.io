import type { CSSProperties, ReactNode } from 'react'

/** Full-height screen frame. Safe-area aware; children position themselves. */
export function Frame({ bg, fg, className = '', style, children, testId }: {
  bg: string; fg: string; className?: string; style?: CSSProperties; children: ReactNode; testId: string
}) {
  return (
    <main
      data-testid={testId}
      className={`relative h-full w-full overflow-hidden font-display select-none transition-[background-color,color] duration-[1100ms] ease-in-out ${className}`}
      style={{ backgroundColor: bg, color: fg, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', ...style }}
    >
      {children}
    </main>
  )
}

/** The sun is a fill, never text. */
export function SunDisc({ size, className = '', style }: { size: number; className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={`rounded-full bg-sun ${className}`} style={{ width: size, height: size, ...style }} />
}

/** Rounded hill shape, drawn behind or in front of the sun. */
export function Hill({ color, className = '', style }: { color: string; className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={`absolute rounded-[50%] pointer-events-none transition-[background-color] duration-[1100ms] ${className}`} style={{ backgroundColor: color, ...style }} />
}

export function TickIcon({ size = 20, stroke = '#FFE38A', width = 3, delay = '.05s', duration = '.4s' }: { size?: number; stroke?: string; width?: number; delay?: string; duration?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
      style={{ strokeDasharray: 24, animation: `draw ${duration} ease-out ${delay} both` }} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

/** Tonight's 4-step progress: Plan, Pact, Hook, Sleep. */
export function StepBars({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="relative pt-6 flex gap-1.5" role="img" aria-label={`Tonight, step ${step} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className="flex-1 h-[5px] rounded-[3px] bg-hill-night overflow-hidden">
          {i < step && <span className="block h-full bg-sun" />}
          {i === step && <span className="block h-full bg-sun origin-left" style={{ animation: 'grow .8s cubic-bezier(.65,0,.35,1) .2s both' }} />}
        </span>
      ))}
    </div>
  )
}

export const Eyebrow = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <p className={`label m-0 ${className}`} style={style}>{children}</p>
)
