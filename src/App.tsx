import type React from 'react'
import { useEffect } from 'react'
import { checkDay, getState, actions, useStore, type ScreenId } from './lib/store'
import { syncReminders } from './lib/reminders'
import Welcome from './screens/Welcome'
import OnbPlan from './screens/OnbPlan'
import OnbPact from './screens/OnbPact'
import OnbHook from './screens/OnbHook'
import OnbSleep from './screens/OnbSleep'
import Wake from './screens/Wake'
import Breathe from './screens/Breathe'
import Act from './screens/Act'
import Down from './screens/Down'
import Rest from './screens/Rest'

const SCREENS: Record<ScreenId, () => React.JSX.Element> = {
  welcome: Welcome, plan: OnbPlan, pact: OnbPact, hook: OnbHook, sleep: OnbSleep, wake: Wake, breathe: Breathe, act: Act, down: Down, rest: Rest,
}

export default function App() {
  const { screen } = useStore()
  useEffect(() => {
    // keep the OS reminders in step with the saved plan; never prompts, and switches the toggle off if the user revoked permission
    const resync = () => { if (getState().pushOn) void syncReminders(false).then((r) => { if (r === 'denied') actions.setPush(false) }) }
    resync()
    const onVisible = () => { if (!document.hidden) { checkDay(); resync() } }
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
