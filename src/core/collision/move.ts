/** Move along a straight joint-space path and stop at the first contact, as the real arm would. */
import type { DofType } from '../robot/schema/types';

export type Probe<C> = (q: number[]) => C | null;

export interface Guarded<C> {
  q: number[];
  /** What stopped the move; null when it went through. */
  contact: C | null;
}

const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

/** Largest change per joint between probes, small enough that thin parts cannot pass through each other. */
export const probeSteps = (types: DofType[]) => types.map((t) => (t === 'hinge' ? 0.02 : 0.002));

export function guardMove<C>(probe: Probe<C>, from: number[], to: number[], steps: number[], refine = 12): Guarded<C> {
  // A pose that already touches must be allowed to move, or the user could never get out.
  if (probe(from)) return { q: [...to], contact: null };
  const n = Math.max(1, Math.ceil(Math.max(0, ...to.map((v, i) => Math.abs(v - from[i]) / steps[i]))));
  let free = 0;
  for (let s = 1; s <= n; s++) {
    const hit = probe(lerp(from, to, s / n));
    if (!hit) {
      free = s / n;
      continue;
    }
    let [lo, hi, contact] = [free, s / n, hit];
    for (let i = 0; i < refine; i++) {
      const mid = (lo + hi) / 2;
      const c = probe(lerp(from, to, mid));
      if (c) [hi, contact] = [mid, c];
      else lo = mid;
    }
    return { q: lerp(from, to, lo), contact };
  }
  return { q: [...to], contact: null };
}
