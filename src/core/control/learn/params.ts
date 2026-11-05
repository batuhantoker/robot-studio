/** Gains as a learner sees them: logarithms, since a gain that is 3× off is equally wrong at any size. */
import { GAIN_KEYS, type Pid, clampGain, gainRange } from '../gains';

export interface GainSpace {
  /** The joints being learned; everything else keeps its gains. */
  joints: number[];
  inertia: number[];
}

export function encode(gains: Pid[], { joints, inertia }: GainSpace): number[] {
  return joints.flatMap((k) => GAIN_KEYS.map((key) => Math.log(clampGain(gains[k][key], gainRange(inertia[k], key)))));
}

export function decode(theta: number[], base: Pid[], { joints, inertia }: GainSpace): Pid[] {
  const out = base.map((g) => ({ ...g }));
  joints.forEach((k, i) => GAIN_KEYS.forEach((key, c) => {
    out[k][key] = clampGain(Math.exp(theta[i * GAIN_KEYS.length + c]), gainRange(inertia[k], key));
  }));
  return out;
}
