/** A slalom for wheeled robots: every wheel rolls while the steerable ones sweep at their Ackermann angles. */
import { chainFrames } from '../../chain/kinematics/frames';
import { enforceLimits } from '../../chain/limbs/limits';
import { limbQ } from '../../chain/limbs/types';
import { dot } from '../../math/linear/vec';
import type { Body } from '../body';
import type { MotionClip, MotionRobot } from '../types';

export interface Wheel {
  spin: number;
  /** Robot joint that turns the wheel about the vertical, its sense (+1 when its axis points up), or null. */
  steer: number | null;
  sense: number;
  ahead: number;
  across: number;
}

/** Spin is the continuous (or last) joint; steering is the hinge before it that no other wheel shares. */
export function wheelsOf(robot: MotionRobot, q: number[], body: Body): Wheel[] {
  const parts = body.parts.filter((p) => p.kind === 'wheel');
  const owners = new Map<number, number>();
  for (const p of parts) for (const i of robot.limbs[p.limb].index) owners.set(i, (owners.get(i) ?? 0) + 1);
  return parts.map((p) => {
    const l = robot.limbs[p.limb], f = chainFrames(l.chain, limbQ(l, q));
    const spinning = l.chain.joints.map((j, i) => (j.continuous ? i : -1)).filter((i) => i >= 0);
    const spinAt = spinning.at(-1) ?? l.index.length - 1;
    const s = spinAt - 1;
    const steerable = s >= 0 && l.chain.joints[s].type === 'hinge' && owners.get(l.index[s]) === 1 && Math.abs(f.axes[s][2]) > 0.8;
    return {
      spin: l.index[spinAt], steer: steerable ? l.index[s] : null, sense: steerable ? Math.sign(f.axes[s][2]) : 1,
      ahead: dot(p.role.tip, body.forward), across: dot(p.role.tip, body.left),
    };
  });
}

export function slalom(robot: MotionRobot, q0: number[], wheels: Wheel[], size: number, period = 5): MotionClip {
  const fixed = wheels.filter((w) => w.steer === null);
  // Cars turn about their rear axle; all-wheel steering turns about the middle.
  const pool = fixed.length ? fixed : wheels;
  const centre = pool.reduce((s, w) => s + w.ahead, 0) / Math.max(pool.length, 1);
  const base = Math.max(...wheels.map((w) => Math.abs(w.ahead - centre)), 0.05);
  const curve = (size * 0.5) / base;
  return {
    period,
    at(t) {
      const q = [...q0];
      const k = curve * Math.sin((2 * Math.PI * t) / period);
      for (const w of wheels) {
        q[w.spin] = q0[w.spin] + (4 * Math.PI * t) / period;
        if (w.steer !== null) q[w.steer] = q0[w.steer] + w.sense * Math.atan2((w.ahead - centre) * k, 1 - w.across * k);
      }
      return enforceLimits(robot.joints, q);
    },
  };
}
