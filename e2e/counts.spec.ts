import { expect, test, type Page, type Route } from '@playwright/test'

// The anonymous counts (src/lib/stats.ts): consent first, numbers only, once per step, opt-out everywhere.
const KEY = 'mornward.daybreak.v1'
const SKEY = 'mornward.stats.v1'
const NOW = new Date(2026, 9, 11, 8, 0)
const key = (d: Date) => { const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const dayOff = (n: number) => { const d = new Date(NOW); d.setDate(d.getDate() + n); return key(d) }
const BEGIN = /begin tonight's setup \(45s\)/i

type Row = { event_id: string; device_id: string; day: string; kind: string; data: Record<string, unknown>; app_version: string }
async function capture(page: Page) {
  const rows: Row[] = []
  const bodies: string[] = []
  await page.route(/supabase\.co/, async (r: Route) => {
    const req = r.request()
    bodies.push(req.postData() ?? '')
    expect(req.url()).toBe('https://cnwwyucolebrcbydbfej.supabase.co/rest/v1/events?columns=event_id,device_id,day,kind,data,app_version')
    expect(req.headers()['apikey']).toMatch(/^sb_publishable_/)
    rows.push(...(JSON.parse(req.postData() ?? '[]') as Row[]))
    await r.fulfill({ status: 201, body: '' })
  })
  return { rows, bodies, kinds: () => rows.map((x) => x.kind) }
}
async function hold(page: Page, ms: number) {
  const box = (await page.getByTestId('sun-orb').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}
const setState = (page: Page, s: Record<string, unknown>) =>
  page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify({ ...(v as object), savedAt: Date.now() })), [KEY, s] as const)
const PACT = 'A clear head before work.'

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW })
})

test('a new person: nothing is sent before Begin; then the whole evening and morning are counted, numbers only', async ({ page }) => {
  const net = await capture(page)
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('consent')).toContainText('Free · No account · Continuing accepts the beta terms.')
  await expect(page.getByTestId('consent')).toContainText('Anonymous counts on · Turn off')
  await expect(page.getByRole('link', { name: 'beta terms' })).toHaveAttribute('href', 'https://mornward.app/terms.html')
  await page.waitForTimeout(500)
  expect(net.rows).toHaveLength(0) // opening Welcome sends nothing

  await page.getByRole('button', { name: BEGIN }).click()
  await expect.poll(() => net.kinds()).toEqual(['app_opened'])
  expect(net.rows[0].data).toMatchObject({ platform: 'web', screen: 'welcome', onboarded: false, run: 0 })
  expect(net.rows[0].day).toBe(key(NOW))
  expect(net.rows[0].app_version).toBe('daybreak-1')

  // the evening: two tasks, a pact, Set my morning
  await page.getByRole('button', { name: /next: your pact/i }).click()
  await page.getByRole('button', { name: /A clear head before work/ }).click()
  await page.getByRole('button', { name: /seal my pact/i }).click()
  await page.getByRole('button', { name: /next: your wake-up push/i }).click()
  await page.getByRole('button', { name: 'Set my morning' }).click()
  await expect.poll(() => net.kinds()).toContain('evening_set')
  const ev = net.rows.find((x) => x.kind === 'evening_set')!
  expect(ev.data).toMatchObject({ tasks: 2, own: false, pact: true, push: false })
  expect(ev.day).toBe(key(NOW)) // the evening it was set

  // the first-night peek at the morning: three real holds, two ticks, the card
  await page.getByRole('button', { name: 'Good night' }).click()
  await page.getByRole('button', { name: 'Tap to begin' }).click()
  for (let i = 0; i < 3; i++) await hold(page, 3350)
  await expect.poll(() => net.kinds()).toContain('sun_hold_done')
  await page.getByRole('button', { name: 'Now, the plan' }).click()
  for (const t of await page.locator('[data-testid^="task-"]').all()) await t.click()
  await expect.poll(() => net.kinds()).toContain('morning_completed')
  const done = net.rows.find((x) => x.kind === 'morning_completed')!
  expect(done.data).toMatchObject({ tasks: 2, breathing: 'held', streak: 1, sunrises: 1 })

  // nothing typed ever leaves: not the pact, not a task name, not the wake time
  const all = net.bodies.join('\n')
  for (const word of [PACT, 'clear head', 'Water first', 'Short walk', '420', '7:00']) expect(all).not.toContain(word)
  // each row's keys are only the allowed ones
  for (const r of net.rows) expect(Object.keys(r).sort()).toEqual(['app_version', 'data', 'day', 'device_id', 'event_id', 'kind'])
  expect(new Set(net.rows.map((x) => x.device_id)).size).toBe(1)

  // a reload counts nothing twice (once a day, once a morning)
  const before = net.rows.length
  await page.reload()
  await page.waitForTimeout(800)
  expect(net.rows.length).toBe(before)
})

test('Turn off on Welcome: the whole flow sends nothing', async ({ page }) => {
  const net = await capture(page)
  const hosts = new Set<string>()
  page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http')) hosts.add(u.host) })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('counts-toggle').click()
  await expect(page.getByTestId('consent')).toContainText('Anonymous counts off · Turn on')
  await page.getByRole('button', { name: BEGIN }).click()
  await page.getByRole('button', { name: /next: your pact/i }).click()
  await page.getByRole('button', { name: /A clear head before work/ }).click()
  await page.getByRole('button', { name: /seal my pact/i }).click()
  await page.getByRole('button', { name: /next: your wake-up push/i }).click()
  await page.getByRole('button', { name: 'Set my morning' }).click()
  await page.waitForTimeout(500)
  expect(net.rows).toHaveLength(0)
  expect([...hosts]).toEqual(['localhost:4173'])
})

test('a returning tester from before counts: asked once, nothing sent until OK, then the catch-up of their mornings', async ({ page }) => {
  const net = await capture(page)
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  const history = [dayOff(-3), dayOff(-2), dayOff(-1)]
  await setState(page, { v: 1, screen: 'sleep', onboarded: true, picked: ['Water first', 'Short walk'], pact: PACT, pactSealed: true, history })
  await page.reload()
  await expect(page.getByTestId('counts-notice')).toBeVisible()
  await expect(page.getByTestId('counts-notice')).toContainText('Never your tasks, your note or your times.')
  await page.waitForTimeout(500)
  expect(net.rows).toHaveLength(0)

  await page.getByTestId('counts-ok').click()
  await expect(page.getByTestId('counts-notice')).toHaveCount(0)
  await expect.poll(() => net.kinds().sort()).toEqual(['app_opened', 'history_synced'])
  const h = net.rows.find((x) => x.kind === 'history_synced')!
  expect(h.data).toMatchObject({ sunrises: 3, streak: 3, days: history, onboarded: true })
  expect(h.day).toBe(key(NOW)) // today's row carries the past dates; nothing is back-dated

  await page.reload()
  await expect(page.getByTestId('screen-wake')).toBeVisible()
  await expect(page.getByTestId('counts-notice')).toHaveCount(0)
  await page.waitForTimeout(500)
  expect(net.kinds().filter((k) => k === 'history_synced')).toHaveLength(1) // once only
})

test('a returning tester who says Turn off counts: nothing is ever sent, and the note never comes back', async ({ page }) => {
  const net = await capture(page)
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await setState(page, { v: 1, screen: 'sleep', onboarded: true, history: [dayOff(-1)] })
  await page.reload()
  await page.getByTestId('counts-decline').click()
  await expect(page.getByTestId('counts-notice')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('counts-notice')).toHaveCount(0)
  await page.waitForTimeout(500)
  expect(net.rows).toHaveLength(0)
})

test('the notice never interrupts the morning ritual (Breathe, Act)', async ({ page }) => {
  await capture(page)
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await setState(page, { v: 1, screen: 'breathe', onboarded: true, pact: PACT, pactSealed: true })
  await page.reload()
  await expect(page.getByTestId('screen-breathe')).toBeVisible()
  await expect(page.getByTestId('counts-notice')).toHaveCount(0)
})

test('Privacy and counts on See you tonight: the anonymous ID, and turning the counts off stops sending', async ({ page }) => {
  const net = await capture(page)
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.evaluate(([k]) => localStorage.setItem(k, JSON.stringify({ deviceId: '0a0a0a0a-1111-4222-8333-444444444444', agreed: { version: 'beta-5', on: '2026-10-11', how: 'welcome' }, backfilled: true })), [SKEY])
  await setState(page, { v: 1, screen: 'rest', onboarded: true })
  await page.reload()
  await page.getByTestId('privacy-open').click()
  await expect(page.getByTestId('privacy-state')).toHaveText('Anonymous counts on')
  await expect(page.getByTestId('privacy-id')).toHaveText('0a0a0a0a-1111-4222-8333-444444444444')
  await expect(page.getByTestId('privacy-sheet')).toContainText('mornward@proton.me')
  await page.getByTestId('privacy-toggle').click()
  await expect(page.getByTestId('privacy-state')).toHaveText('Anonymous counts off')
  const n = net.rows.length
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: "Plan tomorrow's morning" }).click()
  await page.getByRole('button', { name: /next: your pact/i }).click()
  await page.getByRole('button', { name: /A clear head before work/ }).click()
  await page.getByRole('button', { name: /seal my pact/i }).click()
  await page.getByRole('button', { name: /next: your wake-up push/i }).click()
  await page.getByRole('button', { name: 'Set my morning' }).click()
  await page.waitForTimeout(500)
  expect(net.rows.length).toBe(n)
  expect(net.kinds()).not.toContain('evening_set')
})

test('your own phones: ?test=1 marks every row test: true', async ({ page }) => {
  const net = await capture(page)
  await page.goto('/?test=1')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?test=1')
  await page.getByRole('button', { name: BEGIN }).click()
  await expect.poll(() => net.rows.length).toBeGreaterThan(0)
  expect(net.rows.every((r) => r.data.test === true)).toBe(true)
})

test('offline: rows wait on the phone and go when it is back online', async ({ page, context }) => {
  const net = await capture(page)
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await context.setOffline(true)
  await page.getByRole('button', { name: BEGIN }).click()
  await page.waitForTimeout(300)
  expect(net.rows).toHaveLength(0)
  expect((await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SKEY)).outbox).toHaveLength(1)
  await context.setOffline(false)
  await expect.poll(() => net.kinds()).toEqual(['app_opened'])
  await expect.poll(async () => (await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SKEY)).outbox).toHaveLength(0)
})

test('terms page: lists what is counted and the controls', async ({ page }) => {
  await page.goto('/terms.html')
  await expect(page.locator('h1')).toHaveText('What Mornward records, and what it never does.')
  const body = await page.locator('main').innerText()
  for (const s of ['That you opened Mornward', 'That you set your morning in the evening', 'held the sun', 'Privacy and counts', 'Begin tonight\'s setup', 'mornward@proton.me'])
    expect(body).toContain(s)
})
