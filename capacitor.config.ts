import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sts.app', // Unique ID for the Play Store
  appName: 'STS',       // The name shown on the home screen
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;