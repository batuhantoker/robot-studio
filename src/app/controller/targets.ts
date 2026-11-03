/** Per-limb IK targets. */
import { chainFrames } from '../../core/chain/kinematics/frames';
import { limbQ } from '../../core/chain/limbs/types';
import type { Vec3 } from '../../core/math/linear/vec';
import type { RobotSession } from '../robots/session';

export function withTarget(targets: (Vec3 | null)[], limb: number, point: Vec3 | null): (Vec3 | null)[] {
  const next = [...targets];
  while (next.length <= limb) next.push(null);
  next[limb] = point;
  return next;
}

/** Untargeted limbs pinned where their tool points are now, so moving one limb's target leaves the rest in place. */
export function pinAll(s: RobotSession, targets: (Vec3 | null)[], q: number[]): (Vec3 | null)[] {
  return s.limbs.map((l, i) => targets[i] ?? chainFrames(l.chain, limbQ(l, q)).tip.p);
}
