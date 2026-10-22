import type { CapacitorConfig } from '@capacitor/cli'

/*
  The iOS App Store shell around the same dist/ the PWA and Tauri ship.
  Never change `ios.scheme` or `server.hostname` after the first release:
  IndexedDB belongs to the origin, so a new one starts with an empty library.
*/
const config: CapacitorConfig = {
  appId: 'com.lanz.tala',
  appName: 'Tala',
  webDir: 'dist',
}

export default config
