/** Gains as a learner sees them: logarithms, since a gain that is 3× off is equally wrong at any size. */
import { GAIN_KEYS, type Pid, clampGain, gainRange } from '../gains';

export interface GainSpace {
  /** Joints learned together, like a robot's four knees; everything else keeps its gains. */
  groups: number[][];
  inertia: number[];
}

export function encode(gains: Pid[], { groups, inertia }: GainSpace): number[] {
  return groups.flatMap(([k]) => GAIN_KEYS.map((key) => Math.log(clampGain(gains[k][key], gainRange(inertia[k], key)))));
}

export function decode(theta: number[], base: Pid[], { groups, inertia }: GainSpace): Pid[] {
  const out = base.map((g) => ({ ...g }));
  groups.forEach((group, i) => GAIN_KEYS.forEach((key, c) => {
    const value = clampGain(Math.exp(theta[i * GAIN_KEYS.length + c]), gainRange(inertia[group[0]], key));
    for (const k of group) out[k][key] = value;
  }));
  return out;
}
