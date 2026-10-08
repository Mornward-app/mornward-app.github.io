export const pad = (n: number) => (n < 10 ? '0' + n : String(n))
export const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 390 -> { t: '6:30', ap: 'AM' } */
export function fmtMins(m: number) {
  const h24 = Math.floor(m / 60) % 24
  const mm = m % 60
  return { t: `${h24 % 12 === 0 ? 12 : h24 % 12}:${pad(mm)}`, ap: h24 < 12 ? 'AM' : 'PM' }
}
export const fmtMinsFull = (m: number) => {
  const f = fmtMins(m)
  return `${f.t} ${f.ap}`
}
/** clock time as shown on the morning screens, e.g. 7:12 */
export const clock = (d = new Date()) => fmtMins(d.getHours() * 60 + d.getMinutes()).t
export const WEEKDAY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
export const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const DAYNAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Monday-first week containing `d`, as date keys. */
export function weekKeys(d = new Date()): string[] {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start)
    x.setDate(start.getDate() + i)
    return dateKey(x)
  })
}
