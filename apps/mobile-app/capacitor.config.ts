import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor Configuration for GamerBooker iOS and Android Native Apps
 * App Store Bundle ID: ro.gamerbooker.app
 */
const config: CapacitorConfig = {
  appId: 'ro.gamerbooker.app',
  appName: 'GamerBooker',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    scheme: 'GamerBooker',
  },
  android: {
    backgroundColor: '#000000',
    allowMixedContent: false,
  },
};

export default config;
