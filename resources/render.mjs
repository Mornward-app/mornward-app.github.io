// Renders the app icon and splash (sun over a coral hill on night) to PNG. Run: node resources/render.mjs
import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const scene = (size, scale, bg) => `<!doctype html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
<rect width="1024" height="1024" fill="${bg}"/>
<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
<circle cx="512" cy="540" r="250" fill="#FFE38A"/>
<ellipse cx="512" cy="1010" rx="620" ry="400" fill="#E8735A"/>
<ellipse cx="512" cy="1110" rx="700" ry="400" fill="#6B3F7A"/>
</g></svg></body>`
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
for (const [file, size, scale, bg] of [['icon.png', 1024, 1, '#2B2A6B'], ['splash.png', 2732, 0.55, '#2B2A6B'], ['splash-dark.png', 2732, 0.55, '#16153F']]) {
  const page = await b.newPage({ viewport: { width: size, height: size } })
  await page.setContent(scene(size, scale, bg))
  await page.screenshot({ path: new URL(file, import.meta.url).pathname })
  await page.close()
}
await b.close()
