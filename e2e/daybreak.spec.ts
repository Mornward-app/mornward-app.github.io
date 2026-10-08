import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const KEY = 'mornward.daybreak.v1'
const STATE = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY)
const patchState = async (page: Page, patch: Record<string, unknown>) => {
  await page.evaluate(([k, p]) => {
    const cur = JSON.parse(localStorage.getItem(k as string) ?? '{}')
    localStorage.setItem(k as string, JSON.stringify({ ...cur, ...(p as object) }))
  }, [KEY, patch] as const)
  await page.reload()
}
const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})` }

async function hold(page: Page, ms: number) {
  const orb = page.getByTestId('sun-orb')
  const box = (await orb.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

const BEGIN = /begin tonight's setup \(45s\)/i
const begin = (page: Page) => page.getByRole('button', { name: BEGIN }).click()

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('Welcome: first screen for a new user, explains the ritual, begins at step 1', async ({ page }) => {
  const w = page.getByTestId('screen-welcome')
  await expect(w).toBeVisible()
  await expect(page.getByTestId('screen-plan')).toHaveCount(0)
  await expect(w).toContainText('MORNWARD · DAYBREAK')
  await expect(w.getByRole('heading', { level: 1 })).toHaveText('Your morning belongs to you — not the feed.')
  await expect(w.locator('h1 em')).toHaveText('not the feed.')
  await expect(w.locator('h1 em')).toHaveCSS('color', rgb('#FFE9A8'))
  await expect(w.locator('h1 em')).toHaveCSS('font-style', 'italic')
  await expect(w).toContainText('A 4-minute sunrise ritual that stands between your alarm and your first scroll.')
  const steps = w.getByRole('list', { name: 'How it works' }).getByRole('listitem')
  await expect(steps).toHaveCount(3)
  await expect(steps.nth(0)).toContainText('01 · TONIGHT (45s)')
  await expect(steps.nth(0)).toContainText('Pick 3 tiny off-screen moves & leave a 1-line note for 7am you.')
  await expect(steps.nth(1)).toContainText('02 · AT WAKE-UP')
  await expect(steps.nth(1)).toContainText('Hold the sun for 3 slow breaths, then check off your 3 moves to lift the sun.')
  await expect(steps.nth(2)).toContainText('03 · SCREEN OFF')
  await expect(steps.nth(2)).toContainText('Unseal 1 daily science card, then put your phone down.')
  const cta = page.getByRole('button', { name: BEGIN })
  await expect(cta).toHaveCSS('background-color', rgb('#FFB547'))
  // fits the iPhone screen with no scrolling, CTA inside the viewport
  const box = (await cta.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(852)
  expect(await w.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  await cta.click()
  await expect(page.getByTestId('screen-plan')).toBeVisible()
  await expect(page.getByText('TONIGHT · 1 OF 4')).toBeVisible()
  await page.reload() // new users who reload mid-setup resume where they were, not at the welcome
  await expect(page.getByTestId('screen-plan')).toBeVisible()
})

test('Welcome: a user who already onboarded is not sent back to it', async ({ page }) => {
  await patchState(page, { screen: 'plan', onboarded: true })
  await expect(page.getByTestId('screen-plan')).toBeVisible()
})

test('app never talks to Supabase or any other host', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http')) hosts.add(u.host) })
  await page.reload()
  await begin(page)
  await page.getByRole('button', { name: /next: your pact/i }).click()
  await page.getByRole('button', { name: /A clear head before work/ }).click()
  await page.getByRole('button', { name: /seal my pact/i }).click()
  expect([...hosts]).toEqual(['localhost:4173'])
})

test('OnbPlan: custom task input is live, limit shakes, state persists', async ({ page }) => {
  await begin(page)
  await expect(page.getByTestId('screen-plan')).toBeVisible()
  const input = page.getByPlaceholder('+ Write your own tiny task...')
  await expect(input).toBeVisible()
  await expect(page.getByText('2 of 3 · small and real')).toBeVisible()
  await input.fill('Read two pages')
  await page.getByRole('button', { name: 'Add this task' }).click()
  await expect(page.getByRole('button', { name: 'Read two pages' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('3 of 3 · small and real')).toBeVisible()
  // a 4th pick is refused
  await page.getByRole('button', { name: 'Stretch' }).click()
  await expect(page.getByText('3 is the limit. Swap one out.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stretch' })).toHaveAttribute('aria-pressed', 'false')
  // adding a custom task made the last unpicked starter vanish
  await expect(page.getByRole('button', { name: 'Check on a friend' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Read two pages' })).toHaveAttribute('aria-pressed', 'true')
  expect((await STATE(page)).custom).toEqual(['Read two pages'])
})

test('OnbPact: starter chips fill the pact, seal persists across reload', async ({ page }) => {
  await begin(page)
  await page.getByRole('button', { name: /next: your pact/i }).click()
  const seal = page.getByRole('button', { name: /seal my pact/i })
  await expect(seal).toHaveAttribute('aria-disabled', 'true')
  const chips = page.getByRole('group', { name: 'Starter pacts' }).getByRole('button')
  await expect(chips).toHaveCount(3)
  await chips.nth(1).click()
  await expect(page.locator('#pact')).toHaveValue('For my family, before my phone.')
  await seal.click()
  await expect(page.getByText('sealed')).toBeVisible()
  await page.reload()
  await expect(page.locator('#pact')).toHaveValue('For my family, before my phone.')
  await expect(page.getByRole('button', { name: /next: your wake-up push/i })).toBeVisible()
})

test('OnbHook: 7:00 AM default, native push toggle schedules, no Add to Home Screen copy', async ({ page, context }) => {
  await context.grantPermissions(['notifications'])
  await patchState(page, { screen: 'hook', pact: 'x', pactSealed: true })
  await expect(page.getByTestId('wake-time')).toContainText('7:00')
  await expect(page.getByText(/home screen/i)).toHaveCount(0)
  await expect(page.getByText(/add to/i)).toHaveCount(0)
  await page.getByRole('button', { name: '15 minutes later' }).click()
  await expect(page.getByTestId('wake-time')).toContainText('7:15')
  await page.getByRole('button', { name: '15 minutes earlier' }).click()
  const sw = page.getByRole('switch')
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('push-note')).toContainText('One notification at 7:00 AM')
  expect((await STATE(page)).pushOn).toBe(true)
  await page.getByRole('button', { name: 'Set my morning' }).click()
  await expect(page.getByTestId('screen-sleep')).toBeVisible()
  await expect(page.getByText('See you at 7:00 AM.')).toBeVisible()
})

test('OnbHook: the sun is draggable and stays in sync with the buttons', async ({ page }) => {
  await patchState(page, { screen: 'hook', pact: 'x', pactSealed: true })
  const track = page.getByTestId('sun-track')
  const thumb = page.getByTestId('sun-thumb')
  const time = page.getByTestId('wake-time')
  await expect(thumb).toHaveCSS('touch-action', 'auto') // the thumb itself; the track captures the touch
  await expect(track).toHaveCSS('touch-action', 'none')
  await expect(thumb).toHaveAttribute('aria-valuemin', '300')
  await expect(thumb).toHaveAttribute('aria-valuemax', '600')
  const centre = async () => { const b = (await thumb.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  const tb = (await track.boundingBox())!
  const dragTo = async (frac: number) => {
    const from = await centre()
    await page.mouse.move(from.x, from.y); await page.mouse.down()
    const toX = tb.x + tb.width * frac
    for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + ((toX - from.x) * i) / 6, from.y)
    await page.mouse.up()
    await page.waitForTimeout(700) // spring settles
  }

  await expect(time).toContainText('7:00')
  await dragTo(0.995) // far right: 10:00 AM
  await expect(time).toContainText('10:00')
  await expect(thumb).toHaveAttribute('aria-valuenow', '600')
  const lowRight = await centre()
  await dragTo(0.005) // far left: 5:00 AM
  await expect(time).toContainText('5:00')
  await expect(thumb).toHaveAttribute('aria-valuenow', '300')
  const lowLeft = await centre()
  await dragTo(0.5) // top of the arc: 7:30 AM
  await expect(time).toContainText('7:30')
  const top = await centre()
  expect(top.y).toBeLessThan(lowLeft.y - 40) // the sun climbs the arc towards midday
  expect(top.y).toBeLessThan(lowRight.y - 40)
  expect(Math.abs(top.x - (tb.x + tb.width / 2))).toBeLessThan(3)

  // buttons stay in step with the sun
  await page.getByRole('button', { name: '15 minutes later' }).click()
  await expect(time).toContainText('7:45')
  await expect(thumb).toHaveAttribute('aria-valuenow', '465')
  await expect(thumb).toHaveAttribute('aria-valuetext', '7:45 AM')
  await page.waitForTimeout(700)
  expect((await centre()).x).toBeGreaterThan(top.x) // the sun moved right with the button
  await page.getByRole('button', { name: '15 minutes earlier' }).click()
  await page.getByRole('button', { name: '15 minutes earlier' }).click()
  await expect(time).toContainText('7:15')
  // clamps at the ends
  await thumb.focus(); await page.keyboard.press('Home')
  await expect(time).toContainText('5:00')
  await page.getByRole('button', { name: '15 minutes earlier' }).click()
  await expect(time).toContainText('5:00')
  await thumb.focus(); await page.keyboard.press('End')
  await expect(time).toContainText('10:00')
  await page.getByRole('button', { name: '15 minutes later' }).click()
  await expect(time).toContainText('10:00')
  await thumb.focus(); await page.keyboard.press('ArrowLeft')
  await expect(time).toContainText('9:45')
  expect((await STATE(page)).wakeMins).toBe(585)
  await page.reload()
  await expect(page.getByTestId('wake-time')).toContainText('9:45')
})

test('OnbHook: touch drag on the sun works like on an iPhone', async ({ page }) => {
  await patchState(page, { screen: 'hook' })
  const cdp = await page.context().newCDPSession(page)
  const thumb = page.getByTestId('sun-thumb')
  const tb = (await page.getByTestId('sun-track').boundingBox())!
  const b = (await thumb.boundingBox())!
  const y = b.y + b.height / 2
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
  const startX = b.x + b.width / 2
  await touch('touchStart', startX)
  for (let i = 1; i <= 8; i++) await touch('touchMove', startX + ((tb.x + tb.width * 0.9 - startX) * i) / 8)
  await touch('touchEnd', 0)
  await expect(page.getByTestId('wake-time')).not.toContainText('7:00')
  const mins = Number(await thumb.getAttribute('aria-valuenow'))
  expect(mins).toBeGreaterThan(540) // dragged right of 9:00 AM
  expect(mins % 15).toBe(0)
  await expect(page.getByTestId('screen-hook')).toBeVisible()
})

test('OnbHook: denied permission leaves the toggle off and says why', async ({ page }) => {
  await patchState(page, { screen: 'hook' })
  await page.evaluate(() => { Object.defineProperty(window.Notification, 'permission', { get: () => 'denied', configurable: true }); window.Notification.requestPermission = async () => 'denied' })
  await page.getByRole('switch').click()
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('push-note')).toContainText('Turn them on in Settings')
})

test('Onboarding flows into the morning: Wake shows the pact, Good night opens it', async ({ page }) => {
  await patchState(page, { screen: 'sleep', pact: 'A clear head before work.', pactSealed: true })
  await page.getByRole('button', { name: 'Good night' }).click()
  await expect(page.getByTestId('screen-wake')).toBeVisible()
  await expect(page.getByTestId('wake-pact')).toContainText('A clear head before work.')
  await expect(page.getByTestId('wake-clock')).toHaveText('7:00')
  await page.getByRole('button', { name: 'Tap to begin' }).click()
  await expect(page.getByTestId('screen-breathe')).toBeVisible()
  await expect(page.getByTestId('breathe-pact')).toContainText('A clear head before work.')
})

test('Breathe: Breath Hold Guard needs a real 3.2s hold per breath', async ({ page }) => {
  await patchState(page, { screen: 'breathe', pact: 'Mine again.', pactSealed: true, onboarded: true })
  const count = () => page.getByTestId('breath-dots').getAttribute('data-count')
  await expect(page.getByTestId('breathe-state')).toContainText('hold the sun')

  await hold(page, 1000) // far too short
  expect(await count()).toBe('0')
  await expect(page.getByTestId('breathe-state')).toContainText('almost')
  await expect(page.getByTestId('breathe-state')).toContainText('Hold a little longer with your breath.')

  await hold(page, 3000) // just under 3.2s
  expect(await count()).toBe('0')
  expect((await STATE(page)).day.breaths).toBe(0)

  await hold(page, 3350) // a real breath
  expect(await count()).toBe('1')
  await expect(page.getByTestId('breathe-state')).toContainText('and out')

  await hold(page, 500)
  expect(await count()).toBe('1')
  await hold(page, 3350)
  expect(await count()).toBe('2')
  await page.reload() // breaths persist
  await expect(page.getByTestId('breath-dots')).toHaveAttribute('data-count', '2')
  await hold(page, 3350)
  await expect(page.getByTestId('breathe-state')).toContainText('you’re awake.')
  await page.getByRole('button', { name: 'Now, the plan' }).click()
  await expect(page.getByTestId('screen-act')).toBeVisible()
})

test('Act: sun layer stays behind text (z-0, no pointer events) from 0/3 to 3/3', async ({ page }) => {
  await patchState(page, { screen: 'act', onboarded: true, picked: ['Water first', 'Short walk', 'Stretch'] })
  const SKY = ['#2B2A6B', '#6B3F7A', '#E8735A', '#FFE9A8']
  const layer = page.getByTestId('sun-layer')
  await expect(layer).toHaveCSS('z-index', '0')
  await expect(layer).toHaveCSS('pointer-events', 'none')
  await expect(page.getByTestId('act-content')).toHaveCSS('z-index', '10')

  for (let n = 0; n <= 3; n++) {
    if (n > 0) await page.getByTestId(`task-${n - 1}`).click()
    await page.waitForTimeout(1500) // sky and sun settle
    await expect(page.getByTestId('screen-act')).toHaveCSS('background-color', rgb(SKY[n]))
    await expect(page.getByTestId('act-status')).toContainText(`${n} OF 3`)
    // every task pill is the top-most element at its centre: the sun never covers it
    for (let i = 0; i < 3; i++) {
      const covered = await page.getByTestId(`task-${i}`).evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return !hit || !el.contains(hit)
      })
      expect(covered, `task ${i} covered at ${n}/3`).toBe(false)
    }
    if (n === 3) {
      const sun = (await page.getByTestId('sun').boundingBox())!
      const t0 = (await page.getByTestId('task-0').boundingBox())!
      expect(sun.y + sun.height).toBeGreaterThan(t0.y) // the sun really does rise behind the cards
      const cta = page.getByRole('button', { name: 'Sun’s up. Open today’s card' })
      const ok = await cta.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) })
      expect(ok).toBe(true)
    }
  }
  await page.getByRole('button', { name: 'Sun’s up. Open today’s card' }).click()
  await expect(page.getByTestId('screen-down')).toBeVisible()
  const s = await STATE(page)
  expect(s.history).toContain(today())
})

test('Act: fewer tasks still reach morning at the last tick', async ({ page }) => {
  await patchState(page, { screen: 'act', onboarded: true, picked: ['Water first'] })
  await page.getByTestId('task-0').click()
  await page.waitForTimeout(1300)
  await expect(page.getByTestId('screen-act')).toHaveCSS('background-color', rgb('#FFE9A8'))
})

test('Down: unseal today\'s card, 21-card deck, week tracker, put the phone down', async ({ page }) => {
  await patchState(page, { screen: 'down', onboarded: true, picked: ['Water first'], history: [today()],
    day: { date: today(), breaths: 3, ticked: [true], doneAt: new Date().toISOString(), cardIdx: 0, cardOpened: false } })
  await expect(page.getByTestId('week').locator('[data-kept="true"]')).toHaveCount(1)
  await page.getByTestId('mystery-card').click()
  await expect(page.getByTestId('card-open')).toBeVisible({ timeout: 4000 })
  await expect(page.getByTestId('card-open')).toContainText('How long does a new habit really take?')
  await expect(page.getByTestId('card-source')).toContainText('Lally et al.')
  await page.reload() // stays unsealed
  await expect(page.getByTestId('card-open')).toBeVisible()
  await page.getByTestId('open-deck').click()
  await expect(page.getByTestId('deck')).toBeVisible()
  await expect(page.getByTestId('deck-count')).toHaveText('1 of 21 opened')
  await expect(page.locator('[data-testid^="deck-card-"]')).toHaveCount(21)
  await expect(page.locator('[data-testid^="deck-card-"][data-open="true"]')).toHaveCount(1)
  await page.getByTestId('deck-card-0').click()
  await expect(page.getByTestId('deck-detail')).toContainText('Lally et al.')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('phone-down').click()
  await expect(page.getByTestId('resting')).toBeVisible()
})

test('deck source: 21 cards, each with a source, no exclamation marks, no emoji', async () => {
  const src = readFileSync(new URL('../src/lib/cards.ts', import.meta.url), 'utf8')
  expect(src.match(/\bsrc: '/g)).toHaveLength(21)
  expect(src.match(/\bq: '/g)).toHaveLength(21)
  expect(src).not.toMatch(/!/)
  expect(src).not.toMatch(/\p{Extended_Pictographic}/u)
})

test('next day: a new date rolls over, keeps history, routes to Wake in the morning', async ({ page }) => {
  await patchState(page, { screen: 'down', onboarded: true, history: ['2026-10-07'], opened: [0], unlocks: 1,
    day: { date: '2026-10-07', breaths: 3, ticked: [true, true], doneAt: 'x', cardIdx: 0, cardOpened: true } })
  await page.clock.install({ time: new Date(2026, 9, 8, 7, 5) })
  await page.reload()
  await expect(page.getByTestId('screen-wake')).toBeVisible()
  const s = await STATE(page)
  expect(s.history).toEqual(['2026-10-07'])
  expect(s.day.cardIdx).toBe(1)
  expect(s.day.breaths).toBe(0)
})

test('deck loops: after all 21 are open the next card keeps advancing', async ({ page }) => {
  await patchState(page, { screen: 'down', onboarded: true, history: [], opened: Array.from({ length: 21 }, (_, i) => i), unlocks: 23,
    day: { date: '2026-10-07', breaths: 3, ticked: [true, true], doneAt: 'x', cardIdx: 1, cardOpened: true } })
  await page.clock.install({ time: new Date(2026, 9, 8, 7, 5) })
  await page.reload()
  expect((await STATE(page)).day.cardIdx).toBe(2)
})

test('iPhone home screen: viewport-fit, Apple meta, standalone manifest, icons', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
  const m = await (await request.get('/manifest.webmanifest')).json()
  expect(m.display).toBe('standalone')
  expect(m.theme_color).toBe('#2B2A6B')
  for (const u of ['/apple-touch-icon.png', ...m.icons.map((i: { src: string }) => i.src)]) expect((await request.get(u)).ok(), u).toBe(true)
})

test('old service worker and caches are retired', async ({ page }) => {
  await page.evaluate(async () => { await caches.open('mornward-old-shell'); })
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js') })
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 10_000 }).toBe(0)
  await page.evaluate(async () => { await caches.open('mornward-old-shell') })
  await page.reload()
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 10_000 }).toBe(0)
})
