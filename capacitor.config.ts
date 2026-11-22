import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.orbit.planner',
  appName: 'Orbit',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_icon_config_sample', iconColor: '#1f6f4f' },
  },
};

export default config;
