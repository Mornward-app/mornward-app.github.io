import type React from 'react'
import { useEffect } from 'react'
import { checkDay, useStore, type ScreenId } from './lib/store'
import Welcome from './screens/Welcome'
import OnbPlan from './screens/OnbPlan'
import OnbPact from './screens/OnbPact'
import OnbHook from './screens/OnbHook'
import OnbSleep from './screens/OnbSleep'
import Wake from './screens/Wake'
import Breathe from './screens/Breathe'
import Act from './screens/Act'
import Down from './screens/Down'

const SCREENS: Record<ScreenId, () => React.JSX.Element> = {
  welcome: Welcome, plan: OnbPlan, pact: OnbPact, hook: OnbHook, sleep: OnbSleep, wake: Wake, breathe: Breathe, act: Act, down: Down,
}

export default function App() {
  const { screen } = useStore()
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) checkDay() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  const Screen = SCREENS[screen]
  return (
    <div className="mx-auto h-full w-full max-w-[430px]">
      <Screen key={screen} />
    </div>
  )
}
