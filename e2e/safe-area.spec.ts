import { expect, test, type Page } from '@playwright/test'

// Chromium can emulate the iPhone safe areas, so nothing here is guessed: text and buttons must sit inside
// the strip between the Dynamic Island and the home indicator on every screen.
const KEY = 'mornward.daybreak.v1'
const day = new Date(2026, 9, 9)
const SCREENS: { name: string; at: [number, number]; seed?: Record<string, unknown> }[] = [
  { name: 'welcome', at: [8, 0] },
  { name: 'plan', at: [8, 0], seed: { screen: 'plan', onboarded: false } },
  { name: 'pact', at: [8, 0], seed: { screen: 'pact', pact: 'A clear head before work.' } },
  { name: 'pact-writing', at: [8, 0], seed: { screen: 'pact', pact: 'My own words, on my own terms.' } },
  { name: 'pact-sealed', at: [8, 0], seed: { screen: 'pact', pact: 'A clear head before work.', pactSealed: true } },
  { name: 'hook', at: [8, 0], seed: { screen: 'hook' } },
  { name: 'sleep', at: [22, 0], seed: { screen: 'sleep', onboarded: true, pushOn: true, pact: 'x', pactSealed: true, armedFor: '2026-10-10' } },
  { name: 'wake', at: [8, 0], seed: { screen: 'wake', onboarded: true, pact: 'x', pactSealed: true } },
  { name: 'breathe', at: [8, 0], seed: { screen: 'breathe', onboarded: true, pact: 'x', pactSealed: true } },
  { name: 'act', at: [8, 0], seed: { screen: 'act', onboarded: true, picked: ['Water first', 'Short walk', 'Stretch'] } },
  { name: 'down', at: [8, 0], seed: { screen: 'down', onboarded: true, picked: ['Water first'], day: { date: '2026-10-09', breaths: 3, ticked: [true], doneAt: 'x', cardIdx: 0, cardOpened: false } } },
  { name: 'rest', at: [8, 0], seed: { screen: 'rest', onboarded: true, picked: ['Water first'], day: { date: '2026-10-09', breaths: 3, ticked: [true], doneAt: 'x', cardIdx: 0, cardOpened: true } } },
]
const PHONES = [
  { label: 'iPhone with Dynamic Island 393x852', w: 393, h: 852, top: 59, bottom: 34 },
  { label: 'iPhone SE 375x667', w: 375, h: 667, top: 20, bottom: 0 },
]

async function check(page: Page, top: number, bottom: number) {
  return page.evaluate(([t, b]) => {
    const H = innerHeight, W = innerWidth, out: string[] = []
    document.querySelectorAll('main *').forEach((el) => {
      if (el.closest('[aria-hidden="true"]') || el.closest('svg')) return
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())
      const interactive = ['BUTTON', 'INPUT', 'TEXTAREA', 'A'].includes(el.tagName)
      if (!own && !interactive) return
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      if (r.width * r.height > 0.8 * W * H) return // a full-screen tap target is not content
      if (r.top < t - 0.5 || r.bottom > H - b + 0.5) out.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 28)}" ${Math.round(r.top)}..${Math.round(r.bottom)}`)
    })
    return out
  }, [top, bottom] as const)
}

for (const phone of PHONES) {
  test(`Safe areas: ${phone.label}, every screen`, async ({ page }) => {
    await page.setViewportSize({ width: phone.w, height: phone.h })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: phone.top, bottom: phone.bottom } })
    const problems: string[] = []
    for (const sc of SCREENS) {
      await page.clock.install({ time: new Date(day.getFullYear(), day.getMonth(), day.getDate(), sc.at[0], sc.at[1]) }).catch(() => undefined)
      await page.goto('/')
      await page.evaluate(() => localStorage.clear())
      if (sc.seed) await page.evaluate(([k, s]) => localStorage.setItem(k as string, JSON.stringify({ savedAt: Date.now(), pushOn: false, ...(s as object) })), [KEY, sc.seed] as const)
      await page.reload()
      await page.waitForTimeout(2600) // entry animations settle
      const bad = await check(page, phone.top, phone.bottom)
      if (bad.length) problems.push(`${sc.name}: ${bad.join(' | ')}`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })
}
