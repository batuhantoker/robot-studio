/** One MuJoCo WASM instance per page (single-threaded build: no COOP/COEP headers needed). */
import loadMujoco, { type MainModule } from '@mujoco/mujoco';

let instance: Promise<MainModule> | null = null;

export const mujoco = (): Promise<MainModule> => (instance ??= loadMujoco());
export type { MainModule };
