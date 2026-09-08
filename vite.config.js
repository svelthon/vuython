import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { vuython } from './src/lib/vuython.js';

export default defineConfig({
    // 'pre' inside the plugin itself: Vuython rewrites the .vue source before
    // @vitejs/plugin-vue parses it, which is the same place Svelte's
    // `preprocess` hook occupies. Vue has no such hook, so the ordering is the
    // plugin's own.
    plugins: [vuython(), vue()],
    resolve: {
        alias: {
            'vuython/runtime': fileURLToPath(new URL('./src/lib/runtime.js', import.meta.url))
        },
        conditions: ['browser']
    },
    // 5173, 5174, 5180 and 5190 to 5192 are taken by the Svelthon repositories.
    server: { port: 5195, strictPort: true },
    optimizeDeps: {
        // Vite's dependency scanner runs ahead of the plugin pipeline and would
        // hand `<script lang="python">` to a JavaScript parser. Naming what is
        // worth pre-bundling lets the scan be skipped entirely.
        entries: [],
        include: ['vue']
    },
    test: {
        environment: 'jsdom',
        // The first import of a component compiles its Python, which goes past
        // the 5 s default.
        testTimeout: 30000,
        include: ['tests/**/*.test.js'],
        coverage: {
            include: ['src/lib/**'],
            reporter: ['text', 'html']
        }
    }
});
