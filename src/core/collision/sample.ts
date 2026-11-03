/** Random poses the robot could actually take: rejection-sampled against the contact probe. */
import type { Probe } from './move';

export function freeSample<C>(probe: Probe<C>, sample: () => number[], tries = 50): number[] | null {
  for (let i = 0; i < tries; i++) {
    const q = sample();
    if (!probe(q)) return q;
  }
  return null;
}
