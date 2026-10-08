// Screenshots of all 8 screens, for visual review. Usage: node e2e/shots.mjs <outDir> [baseUrl]
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync } from 'node:fs'
const out = process.argv[2] ?? 'shots', base = process.argv[3] ?? 'http://localhost:4173'
mkdirSync(out, { recursive: true })
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
const KEY = 'mornward.daybreak.v1'
const d = new Date(), p = (n) => String(n).padStart(2, '0'), today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
for (const [w, h] of [[393, 852], [375, 667]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })).newPage()
  await page.goto(base)
  const set = async (screen, extra = {}) => {
    await page.evaluate(([k, s, e]) => localStorage.setItem(k, JSON.stringify({ screen: s, onboarded: true, pact: 'To feel like myself again.', pactSealed: true, pushOn: true, picked: ['Water first', 'Short walk', 'Stretch'], ...e })), [KEY, screen, extra])
    await page.reload(); await page.waitForTimeout(2800)
  }
  for (const s of ['welcome', 'plan', 'pact', 'hook', 'sleep', 'wake', 'breathe']) { await set(s); await page.screenshot({ path: `${out}/${w}-${s}.png` }) }
  await set('breathe'); const box = await page.getByTestId('sun-orb').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(3600)
  await page.screenshot({ path: `${out}/${w}-breathe-hold.png` }); await page.mouse.up()
  await set('act'); await page.screenshot({ path: `${out}/${w}-act0.png` })
  for (let i = 0; i < 3; i++) { await page.getByTestId(`task-${i}`).click(); await page.waitForTimeout(1900); await page.screenshot({ path: `${out}/${w}-act${i + 1}.png` }) }
  await set('down', { history: [today], day: { date: today, breaths: 3, ticked: [true, true, true], doneAt: 'x', cardIdx: 0, cardOpened: false } })
  await page.screenshot({ path: `${out}/${w}-down-sealed.png` })
  await page.getByTestId('mystery-card').click(); await page.waitForTimeout(2200); await page.screenshot({ path: `${out}/${w}-down-open.png` })
  await page.getByTestId('open-deck').click(); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/${w}-deck.png` })
}
await b.close()
