/** The whole robot's mass, body by body, from what its chains carry. */
import { chainFrames } from '../../chain/kinematics/frames';
import type { ChainMass } from '../../chain/model/types';
import { limbQ } from '../../chain/limbs/types';
import { applyTransform } from '../../math/linear/transform';
import { type Vec3, add, scale } from '../../math/linear/vec';
import type { MotionRobot } from '../types';

export interface MassPoint {
  m: number;
  p: Vec3;
}

export function massPoints(robot: MotionRobot): (q: number[]) => MassPoint[] {
  // Every chain lists every body, off-chain ones frozen, so each body counts from the chain that really moves it.
  const best = new Map<string, { limb: number; m: ChainMass }>();
  robot.limbs.forEach((l, limb) => l.chain.masses.forEach((m) => {
    const held = best.get(m.name);
    if (!held || m.joint > held.m.joint) best.set(m.name, { limb, m });
  }));
  const list = [...best.values()];
  return (q) => {
    const frames = robot.limbs.map((l) => chainFrames(l.chain, limbQ(l, q)));
    return list.map(({ limb, m }) => ({ m: m.mass, p: applyTransform(m.joint < 0 ? robot.limbs[limb].chain.base : frames[limb].frames[m.joint], m.com) }));
  };
}

export function massModel(robot: MotionRobot): (q: number[]) => Vec3 {
  const points = massPoints(robot);
  return (q) => {
    const all = points(q), total = all.reduce((s, b) => s + b.m, 0) || 1;
    return scale(all.reduce<Vec3>((s, b) => add(s, scale(b.p, b.m)), [0, 0, 0]), 1 / total);
  };
}
