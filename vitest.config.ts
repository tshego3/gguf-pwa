import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // worker/ is a separate deployable with its own tsconfig and its own
    // npm install, but its pure logic - provider order, SSE framing, delta
    // and tool-call reassembly, request validation - has no Cloudflare
    // globals in it and belongs in the same `npm test` as everything else.
    include: ['src/**/*.test.{ts,tsx}', 'worker/src/**/*.test.ts'],
    css: false,
  },
});
