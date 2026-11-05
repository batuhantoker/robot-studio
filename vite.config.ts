import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
// @ts-expect-error The build scripts are plain JavaScript.
import { castingsVersion } from './scripts/bake/version.mjs';

export default defineConfig({
  define: { __CASTINGS__: JSON.stringify(castingsVersion()) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { exclude: ['@mujoco/mujoco'] },
  build: {
    // public/ only holds locally fetched third-party robots; never ship them.
    copyPublicDir: false,
    chunkSizeWarningLimit: 1600,
  },
  test: { include: ['test/**/*.test.ts'], testTimeout: 60_000 },
});
