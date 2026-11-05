/** Easier and easier versions of a motion, tried in turn until one balances and touches nothing. */
import type { Footing, MotionClip } from '../types';
import type { SteppingClip } from './clip';

/** The least room the ZMP may leave at the edge of the support (m). */
const FIRM = 2e-3;
/** Poses of a finished clip checked for contact. */
const PROBES = 160;

const clears = (clip: MotionClip, touches: (q: number[]) => boolean) => {
  const span = clip.period + (clip.lead ?? 0);
  return !Array.from({ length: PROBES }, (_, i) => (span * i) / PROBES).some((t) => touches(clip.at(t)));
};

/** The first of `rungs` the body can do, or null. Slow: for the offline table, or off the load path. */
export function firstRung(rungs: number, at: (rung: number) => MotionClip | null, touches: Footing['touches'], budget = Infinity): number | null {
  const start = performance.now();
  for (let rung = 0; rung < rungs; rung++) {
    if (performance.now() - start > budget) return null;
    const clip = at(rung) as SteppingClip | null;
    if (clip && clip.balance >= FIRM && (!touches || clears(clip, touches))) return rung;
  }
  return null;
}
