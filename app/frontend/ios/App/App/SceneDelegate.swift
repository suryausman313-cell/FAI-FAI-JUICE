import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.faifaijuice.app',
  appName: 'Fai Fai Juice',
  webDir: 'dist',

  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
