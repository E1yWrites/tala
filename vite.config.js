import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
    plugins: [react()],
    // Relative asset URLs so the built app works from file://, tauri:// and
    // any sub-path deployment alike (Notely uses no URL routing).
    base: './',
    resolve: {
        alias: [
            // Route every lucide-react import through the doodle-icon shim so
            // files dropped into src/assets/icons can override any built-in icon.
            { find: /^lucide-react$/, replacement: path.resolve(__dirname, './src/lib/lucideShim.tsx') },
            { find: '@', replacement: path.resolve(__dirname, './src') },
        ],
    },
    build: {
        target: 'es2020',
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (!id.includes('node_modules'))
                        return undefined;
                    if (id.includes('@tiptap') || id.includes('prosemirror'))
                        return 'tiptap';
                    if (id.includes('react') || id.includes('scheduler'))
                        return 'react';
                    if (id.includes('dexie'))
                        return 'dexie';
                    return undefined;
                },
            },
        },
    },
});
