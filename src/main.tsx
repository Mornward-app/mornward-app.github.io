import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initNative } from './lib/native'
import { hydrate } from './lib/store'
import { retireOldServiceWorkers } from './lib/retire-sw'
import './index.css'

void retireOldServiceWorkers()
initNative()

// Read the saved state from the device first, so the first frame is the user's real screen and nothing is overwritten.
void hydrate().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
