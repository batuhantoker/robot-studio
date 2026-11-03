/** Tell legs from arms by where tool points sit, and give legs a side and an end (front/hind). */
import { chainFrames } from '../chain/kinematics/frames';
import { limbQ } from '../chain/limbs/types';
import { type Vec3, norm, sub } from '../math/linear/vec';
import type { MotionRobot } from './types';

/** Sensor heads and masts: on a robot with several limbs, never driven as arms. */
export const HEAD_NAME = /head|camera|neck|imu|eye|gaze|rgbd|lidar|mast/i;

export interface LimbRole {
  limb: number;
  role: 'leg' | 'arm' | 'other';
  base: Vec3;
  tip: Vec3;
  length: number;
  left: boolean;
  front: boolean;
}

export function limbRoles(robot: MotionRobot, q: number[]): LimbRole[] {
  const raw = robot.limbs.map((l, limb) => {
    const f = chainFrames(l.chain, limbQ(l, q));
    const pts = [...f.origins, f.tip.p];
    const length = pts.slice(1).reduce((s, p, i) => s + norm(sub(p, pts[i])), 0);
    return { limb, base: f.origins[0] ?? f.tip.p, tip: f.tip.p, length, joints: l.chain.joints.length, name: l.name };
  });
  const zs = raw.flatMap((r) => [r.base[2], r.tip[2]]);
  const [zmin, zmax] = [Math.min(...zs), Math.max(...zs)];
  const isLeg = (r: (typeof raw)[number]) => r.joints >= 2 && r.tip[2] < zmin + 0.3 * (zmax - zmin) && r.tip[2] < r.base[2] - 0.25 * r.length;
  const isHead = (r: (typeof raw)[number]) => raw.length > 1 && (HEAD_NAME.test(r.name)
    || (r.tip[2] - r.base[2] > 0.3 * r.length && Math.hypot(r.tip[0] - r.base[0], r.tip[1] - r.base[1]) < 0.25 * r.length));
  const legs = raw.filter(isLeg);
  const cx = legs.reduce((s, r) => s + r.tip[0], 0) / Math.max(legs.length, 1);
  const cy = legs.reduce((s, r) => s + r.tip[1], 0) / Math.max(legs.length, 1);
  return raw.map((r) => ({
    limb: r.limb, base: r.base, tip: r.tip, length: r.length,
    // Two-joint appendages are pan-tilt heads and masts, not manipulators.
    role: isLeg(r) ? 'leg' : r.joints >= 3 && !isHead(r) ? 'arm' : 'other',
    left: r.tip[1] > cy, front: r.tip[0] > cx,
  }));
}
