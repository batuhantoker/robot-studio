/** Motions defined joint by joint, no IK: a ripple through every joint, and spinning wheels. */
import { enforceLimits } from '../../chain/limbs/limits';
import type { MotionClip, MotionRobot } from '../types';

function centred(lo: number, hi: number, q: number, amp: number): [number, number] {
  const a = Math.min(amp, (hi - lo) / 2);
  return [Math.min(Math.max(q, lo + a), hi - a), a];
}

export function jointWave(robot: MotionRobot, q0: number[], size: number, period = 4): MotionClip {
  const n = robot.joints.length;
  const params = robot.joints.map((j, i) => {
    const span = Math.min(j.limits[1] - j.limits[0], 2 * Math.PI);
    return centred(j.limits[0], j.limits[1], q0[i], size * 0.18 * span);
  });
  return {
    period,
    at: (t) => params.map(([c, a], i) => c + a * Math.sin((2 * Math.PI * t) / period - (i / Math.max(n, 1)) * Math.PI * 1.5)),
  };
}

/**
 * A ripple that travels through `joints` in order (hand to shoulder to hand, say), each swinging only toward
 * `dir` and back, so an arm opens away from the body instead of folding into it; every other joint holds.
 */
export function ripple(robot: MotionRobot, q0: number[], joints: { i: number; dir: number }[], size: number, period = 4): MotionClip {
  const n = Math.max(joints.length, 1);
  const amp = joints.map(({ i }) => {
    const [lo, hi] = robot.joints[i].limits;
    return size * Math.min(0.16 * Math.min(hi - lo, 2 * Math.PI), 0.45);
  });
  return {
    period,
    at: (t) => {
      const q = [...q0];
      joints.forEach(({ i, dir }, k) => {
        const phase = (2 * Math.PI * t) / period - (k / n) * Math.PI * 1.5;
        q[i] = q0[i] + dir * amp[k] * (0.5 - 0.5 * Math.cos(phase));
      });
      return enforceLimits(robot.joints, q);
    },
  };
}

/** Joints of wheel limbs turn continuously; joints elsewhere hold their pose. */
export function drive(robot: MotionRobot, q0: number[], wheels: Set<number>, size: number, period = 3): MotionClip {
  const spin = robot.joints.map((j, i) => wheels.has(i) && j.type === 'hinge' && (j.continuous || j.limits[1] - j.limits[0] >= 2 * Math.PI - 1e-6));
  return {
    period,
    at: (t) => enforceLimits(robot.joints, q0.map((v, i) => (spin[i] ? v + size * ((2 * Math.PI * t) / period) : v))),
  };
}
