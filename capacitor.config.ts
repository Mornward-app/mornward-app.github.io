import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.mornward',
  appName: 'Mornward',
  webDir: 'dist',
  backgroundColor: '#2B2A6B',
  ios: { contentInset: 'never' },
  plugins: {
    LocalNotifications: { iconColor: '#FFE38A', smallIcon: 'ic_stat_sun' },
  },
}

export default config
