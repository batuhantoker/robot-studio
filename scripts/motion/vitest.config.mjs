import { fileURLToPath } from 'node:url';

// Run with: npm run motion:gaits. Needs the fetched robot pack in public/robots.
export default {
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  optimizeDeps: { exclude: ['@mujoco/mujoco'] },
  test: { include: ['scripts/motion/*.test.ts'], testTimeout: 1_800_000, root: fileURLToPath(new URL('../..', import.meta.url)) },
};
