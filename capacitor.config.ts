import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.firstlight.app',
  appName: 'First Light',
  webDir: 'dist',
  backgroundColor: '#2B2A6B',
  ios: { contentInset: 'never' },
  plugins: {
    LocalNotifications: { iconColor: '#FFE38A', smallIcon: 'ic_stat_sun' },
  },
}

export default config
