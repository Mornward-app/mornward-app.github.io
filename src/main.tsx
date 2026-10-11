import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initNative } from './lib/native'
import { getState, hydrate } from './lib/store'
import { hydrateStats, trackOpen } from './lib/stats'
import { retireOldServiceWorkers } from './lib/retire-sw'
import './index.css'

void retireOldServiceWorkers()
initNative()

// Read the saved state from the device first, so the first frame is the user's real screen and nothing is overwritten.
// Both stores are read together; then opening the app is counted (once a day, and only after consent).
void Promise.all([hydrate(), hydrateStats().catch(() => undefined)]).finally(() => {
  const s = getState()
  trackOpen(s.screen, s.onboarded)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
