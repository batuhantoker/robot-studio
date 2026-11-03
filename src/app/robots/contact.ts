/** Shared settings for session contact checkers. */
import type { Assembly } from '../../cad/assembly/types';

/** Penetration ignored before a pose counts as touching: a thousandth of the robot's size. */
export const contactTol = (size: number) => Math.max(1e-4, 1e-3 * size);

export const moduleLabel = (a: Assembly) => (id: string) => a.modules.find((m) => m.id === id)?.label ?? id;
