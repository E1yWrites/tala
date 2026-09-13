import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Unit/integration tests run under jsdom with an in-memory IndexedDB
 * (fake-indexeddb) so repositories and the Dexie schema are exercised for
 * real. The lucide shim alias mirrors vite.config.ts so component imports
 * resolve the same way they do in the app.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^lucide-react$/, replacement: path.resolve(__dirname, './src/lib/lucideShim.tsx') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // pptxtojson ships a UMD `main` that Node cannot evaluate as ESM; the
      // browser build (what Vite serves) is the ESM entry, so use it here too.
      { find: /^pptxtojson$/, replacement: path.resolve(__dirname, './node_modules/pptxtojson/dist/index.js') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 20000,
  },
})
