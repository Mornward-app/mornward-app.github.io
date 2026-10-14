import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// Source-level guards for the App Store promise "Data Not Collected": no code path can reach a server.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const read = (p: string) => readFileSync(p, 'utf8')

const FORBIDDEN = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /\bWebSocket\b/, /EventSource/, /supabase/i, /\bnavigator\.connection\b/, /analytics/i, /gtag|firebase|sentry|mixpanel|amplitude/i]

test('source code has no network calls, trackers or Supabase', () => {
  const offenders: string[] = []
  for (const f of walk('src').filter((p) => /\.(ts|tsx)$/.test(p) && !p.endsWith('.test.ts'))) {
    const text = read(f)
    for (const re of FORBIDDEN) if (re.test(text)) offenders.push(`${f}: ${re}`)
  }
  expect(offenders).toEqual([])
})

test('the only web addresses in src are the two links in links.ts', () => {
  const urls = new Set<string>()
  for (const f of walk('src').filter((p) => /\.(ts|tsx|css)$/.test(p) && !p.endsWith('.test.ts')))
    for (const m of read(f).matchAll(/https?:\/\/[^\s'"`)]+/g)) urls.add(m[0])
  const ok = (u: string) => u.startsWith('https://mornward.app/') || u === 'http://www.w3.org/2000/svg'
  expect([...urls].filter((u) => !ok(u))).toEqual([])
})

test('the built web bundle contains no Supabase address and no call that sends data', () => {
  const bad: string[] = []
  for (const f of walk('dist').filter((p) => p.endsWith('.js'))) {
    const t = read(f)
    if (/supabase\.co/.test(t)) bad.push(`${f}: supabase.co`)
    if (/sb_publishable_/.test(t)) bad.push(`${f}: a publishable key`)
  }
  expect(bad).toEqual([])
})

test('Android declares no INTERNET permission, and iOS has no network entitlement to add', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '')
  expect(manifest).not.toMatch(/android\.permission\.INTERNET/)
})

test('the chime key is stubbed as chime.wav and off', async () => {
  const src = read('src/lib/reminder-payload.ts')
  expect(src).toMatch(/CHIME_FILE = 'chime\.wav'/)
  expect(src).toMatch(/CHIME_READY = false/)
})

test('Restore Purchases stays out of the app until real in-app purchases exist', () => {
  const offenders = walk('src').filter((p) => /\.(ts|tsx)$/.test(p) && /restore\s*purchases/i.test(read(p)))
  expect(offenders).toEqual([])
})
