// WCAG AA contrast check for every text/background pair the Daybreak screens use. Fails (exit 1) below 4.5:1,
// the AA bar for normal text, and applies it to large text too. Non-text shapes need 3:1.
import { readFileSync } from 'node:fs'

const t = JSON.parse(readFileSync(new URL('../src/tokens.json', import.meta.url), 'utf8'))
const c = t.colors
const lum = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const TEXT = [
  // rule 5: night-mode placeholders and subtitles
  ['placeholder / subtitle on night', c.soft, '#2E2D6E'],
  ['placeholder / subtitle on night token', c.soft, c.night],
  ['placeholder / subtitle on field/hill', c.soft, c['hill-night']],
  ['subtitle on deep night', c.soft, c.deep],
  // rule 5: weekday and source labels on Morning Gold
  ['weekday / source label on morning gold', c.label, c.morning],
  ['source label on cream card', c.label, c.cream],
  ['source label on pale gold card', c.label, c.morning],
  // sky scale
  ['cream on night', c.cream, c.night],
  ['cream on plum', c.cream, c.plum],
  ['cream on deep night', c.cream, c.deep],
  ['ink on coral', c.ink, c.coral],
  ['ink on morning', c.ink, c.morning],
  ['cream on plum-step hill (Act footer)', c.cream, c['hill-plum']],
  ['ink on peach hill (Act footer)', c.ink, c['hill-peach']],
  ['cream on hill-night (button label / sleep)', c.cream, c['hill-night']],
  ['cream on wake sky', c.cream, '#1E1D52'],
  ['cream on breathe steps', c.cream, '#3A2F78'],
  ['cream on breathe steps 2', c.cream, '#4E3584'],
  // muted text
  ['muted on night', c.muted, c.night],
  ['muted on plum', c.muted, c.plum],
  ['muted on breathe step 3', c.muted, '#4E3584'],
  ['muted on wake sky', c.muted, '#1E1D52'],
  ['muted on deep night', c.muted, c.deep],
  ['muted-2 labels on night', c['muted-2'], c.night],
  ['muted-2 labels on hill-night', c['muted-2'], c['hill-night']],
  ['muted-2 labels on deep night', c['muted-2'], c.deep],
  ['soft on wake notification card', c.soft, c.night],
  // Welcome screen: #25245C -> #2E2D6E -> #523E7C gradient, amber CTA
  ['welcome kicker / subtitle on gradient top', c.soft, '#25245C'],
  ['welcome kicker / subtitle on gradient middle', c.soft, '#2E2D6E'],
  ['welcome subtitle on gradient bottom', c.soft, '#523E7C'],
  ['welcome step text on gradient middle', c.muted, '#2E2D6E'],
  ['welcome step text on gradient bottom', c.muted, '#523E7C'],
  ['welcome headline on gradient', c.cream, '#2E2D6E'],
  ['welcome italic gold on gradient top', '#FFE9A8', '#25245C'],
  ['welcome italic gold on gradient middle', '#FFE9A8', '#2E2D6E'],
  ['welcome italic gold on gradient bottom', '#FFE9A8', '#523E7C'],
  ['welcome CTA label on amber', c.ink, '#FFB547'],
  ['alarm badge (sun) on night', c.sun, c.night],
  ['alarm badge (sun) on deep night', c.sun, c.deep],
  ['pre-prompt eyebrow (ember) on cream', c.ember, c.cream],
  ['pre-prompt body on cream', c.label, c.cream],
  ['Pact chips on night', c.cream, c.night],
  ['Pact chip selected (ink on sun)', c.ink, c.sun],
  ['Pact card text on hill-night', c.cream, c['hill-night']],
  ['Pick a line link on hill-night? (muted on night)', c.muted, c.night],
  ['sun hint labels on hook card', c.soft, c['hill-night']],
  // terms line on Welcome (solid night backing) and the terms link on Rest
  ['terms line on its night backing (Welcome)', c.soft, '#2E2D6E'],
  ['terms link (cream) on its night backing (Welcome)', c.cream, '#2E2D6E'],
  ['Terms and privacy link on rest sky', c.soft, '#16153F'],
  // buttons and cards
  ['ink on butter button', c.ink, c.sun],
  ['cream on ink button', c.cream, c.ink],
  ['ink on cream button / task', c.ink, c.cream],
  ['task number on cream', c['label-2'], c.cream],
  ['notification meta on cream', c['label-2'], c.cream],
  ['notification body on cream', c.label, c.cream],
  ['card label (ember) on cream', c.ember, c.cream],
  ['plum card hint', c['plum-text'], c.plum],
  ['sun-yellow on plum card', c.sun, c.plum],
  ['ink on coral chip', c.ink, c.coral],
  ['cream on ink chip', c.cream, c.ink],
  ['task number on butter (done)', c['label-2'], c.sun],
  ['ink on morning (sheet detail)', c.ink, c.morning],
  ['label on deck tile sun', c.label, c.sun],
  ['plum text on deck tile', c['plum-text'], c.plum],
  ['sun on night (limit message)', c.sun, c.night],
]
const SHAPES = [
  ['dashed unkept day ring on morning', c.dash, c.morning],
  ['switch track (off) on hill-night', c.line, c['hill-night']],
  ['welcome step rail on gradient', '#FFB547', '#2E2D6E'],
  ['chip outline on night', c.line, c.night],
]

let fail = 0
const show = (name, a, b, min) => {
  const r = ratio(a, b)
  const ok = r >= min
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${name}  ${a} on ${b}`)
}
TEXT.forEach(([n, a, b]) => show(n, a, b, 4.5))
SHAPES.forEach(([n, a, b]) => show(n, a, b, 3))
console.log(fail ? `\n${fail} pair(s) below AA` : `\nAll ${TEXT.length + SHAPES.length} pairs pass AA`)
process.exit(fail ? 1 : 0)
