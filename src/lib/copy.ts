import { fmtMins } from './dates'

/** The body of the one morning notification, built from tonight's plan. */
export function notifBody(picked: string[]): string {
  const [a, b] = picked
  if (!a) return 'The sun’s waiting for you.'
  const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1)
  return `${a}${b ? `, then ${lower(b)}` : ''}. The sun’s waiting for you.`
}
export const timeLabel = (m: number) => { const f = fmtMins(m); return `${f.t} ${f.ap}` }
