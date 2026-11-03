/** One robot-level sample set from every limb's samples (each limb measures reach from its base). */
import type { WorkspaceSamples } from './sample';

export function mergeSamples(list: WorkspaceSamples[]): WorkspaceSamples {
  return {
    points: list.flatMap((s) => s.points),
    manipulability: list.flatMap((s) => s.manipulability),
    torqueRatio: list.flatMap((s) => s.torqueRatio),
    limitMargin: list.flatMap((s) => s.limitMargin),
    reach: list.flatMap((s) => s.reach),
  };
}
