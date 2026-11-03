import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { exclude: ['@mujoco/mujoco'] },
  build: {
    // public/ only holds locally fetched third-party robots; never ship them.
    copyPublicDir: false,
    chunkSizeWarningLimit: 1600,
  },
  test: { include: ['test/**/*.test.ts'], testTimeout: 60_000 },
});
