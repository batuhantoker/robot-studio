/**
 * A robot with several end effectors (legs, arms) is a set of limbs: serial chains whose joints
 * map into one whole-robot joint vector. Shared trunk joints appear once in that vector.
 */
import type { DofType } from '../../robot/schema/types';
import type { Chain } from '../model/types';

export interface RobotJoint {
  name: string;
  type: DofType;
  limits: [number, number];
  q0: number;
  continuous?: boolean;
}

export interface Limb {
  name: string;
  chain: Chain;
  /** Whole-robot index of each chain joint. */
  index: number[];
}

export const limbQ = (limb: Limb, q: ArrayLike<number>): number[] => limb.index.map((i) => q[i]);

/** Merge chains into limbs over one joint vector; `keys` identify the same joint across chains. */
export function mergeLimbs<K extends string | number>(parts: { name: string; chain: Chain; keys: K[] }[]) {
  const joints: RobotJoint[] = [];
  const keys: K[] = [];
  const slot = new Map<K, number>();
  const limbs: Limb[] = parts.map(({ name, chain, keys: own }) => ({
    name,
    chain,
    index: chain.joints.map((j, k) => {
      if (!slot.has(own[k])) {
        slot.set(own[k], joints.length);
        keys.push(own[k]);
        joints.push({ name: j.name, type: j.type, limits: j.limits, q0: j.q0, continuous: j.continuous });
      }
      return slot.get(own[k])!;
    }),
  }));
  return { joints, limbs, keys };
}

/** Joints that belong to more than one limb (a humanoid's waist, a dual arm's torso). */
export function sharedJoints(limbs: Limb[]): Set<number> {
  const seen = new Map<number, number>();
  for (const l of limbs) for (const i of l.index) seen.set(i, (seen.get(i) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([i]) => i));
}
