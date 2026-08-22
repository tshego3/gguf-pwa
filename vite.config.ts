import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

// The SW version and the WASM version must move together (P5-T2), so the
// build stamps one identifier the SW reports and Settings displays,
// derived from the package version plus a build timestamp - never
// hand-edited, so it cannot drift from what actually shipped.
const swVersion = `${pkg.version}+${Date.now().toString(36)}`;

export default defineConfig({
  define: {
    __SW_VERSION__: JSON.stringify(swVersion),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      outDir: 'dist',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        rollupFormat: 'iife',
        // Weights live in OPFS, never in the precache manifest - only the
        // app shell and the vendored WASM runtime binary are precached.
        // The wllama.wasm runtime itself is ~8.5 MB, well past Workbox's
        // default 2 MiB precache ceiling, so that ceiling is raised here.
        // mjs is included for pdfjs's worker, which ships as an ES module -
        // without it the PDF attachment tool works online and fails offline,
        // which breaks the "full conversation with the network disabled"
        // promise in a way the user would only discover on a plane.
        // webmanifest is included so an offline cold start can still resolve
        // the install metadata rather than 404ing for it.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  base: '/gguf-pwa/',
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/@mantine/core/') ||
            id.includes('node_modules/@mantine/hooks/')
          ) {
            return 'framework';
          }
          if (id.includes('node_modules/@wllama/')) {
            return 'wllama';
          }
        },
      },
    },
  },
});
