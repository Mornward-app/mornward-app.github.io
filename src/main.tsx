import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initNative } from './lib/native'
import { retireOldServiceWorkers } from './lib/retire-sw'
import './index.css'

void retireOldServiceWorkers()
initNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
