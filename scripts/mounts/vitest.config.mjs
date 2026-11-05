// npx vitest run --config scripts/mounts/vitest.config.mjs  (needs public/robots; rewrites src/cad/assembly/mjcf/mounts.json)
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
export default {
  root,
  resolve: { alias: { '@': `${root}src` } },
  optimizeDeps: { exclude: ['@mujoco/mujoco'] },
  test: { include: ['scripts/mounts/*.test.ts'], environment: 'node', testTimeout: 600_000 },
};
