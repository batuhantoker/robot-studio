/** The rig as a controller sees it: joint angles from hanging, the second measured from the first, with torque at each joint. */
import type { Bars } from '../../motion/generators/double-pendulum';

export interface Rig extends Bars {
  /** Rotor inertia per joint, as the simulation carries it. */
  armature: [number, number];
  /** The most a motor gives (N·m). */
  limit: number;
}

/** Angles then rates. */
export type X = [number, number, number, number];
export type Torque = [number, number];

/** Which joints have a working motor: 0 the shoulder, 1 the elbow. */
export type Motors = readonly number[];

export const UPRIGHT: X = [Math.PI, 0, 0, 0];

export function accel({ m, l, c, I, g, armature }: Rig, [q1, q2, w1, w2]: X, [t1, t2]: Torque): [number, number] {
  const J1 = I[0] + m[0] * c[0] * c[0], J2 = I[1] + m[1] * c[1] * c[1], k = m[1] * l[0] * c[1];
  const cos = Math.cos(q2), sin = Math.sin(q2), far = Math.sin(q1 + q2);
  const M11 = J1 + J2 + m[1] * l[0] * l[0] + 2 * k * cos + armature[0], M12 = J2 + k * cos, M22 = J2 + armature[1];
  const r1 = t1 + k * sin * (2 * w1 * w2 + w2 * w2) - g * (m[0] * c[0] + m[1] * l[0]) * Math.sin(q1) - g * m[1] * c[1] * far;
  const r2 = t2 - k * sin * w1 * w1 - g * m[1] * c[1] * far;
  const det = M11 * M22 - M12 * M12;
  return [(M22 * r1 - M12 * r2) / det, (M11 * r2 - M12 * r1) / det];
}

const rate = (r: Rig, x: X, t: Torque): X => {
  const [a, b] = accel(r, x, t);
  return [x[2], x[3], a, b];
};

export function advance(r: Rig, x: X, t: Torque, h: number): X {
  const along = (k: X, by: number) => x.map((v, i) => v + k[i] * by) as X;
  const k1 = rate(r, x, t), k2 = rate(r, along(k1, h / 2), t), k3 = rate(r, along(k2, h / 2), t), k4 = rate(r, along(k3, h), t);
  return x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as X;
}

/** What `u`, one value per working motor, asks of the joints. */
export function torqueOf(motors: Motors, u: number[]): Torque {
  const t: Torque = [0, 0];
  motors.forEach((j, i) => (t[j] = u[i]));
  return t;
}

export function mechanicalEnergy({ m, l, c, I, g }: Rig, [q1, q2, w1, w2]: X): number {
  const J1 = I[0] + m[0] * c[0] * c[0], J2 = I[1] + m[1] * c[1] * c[1], k = m[1] * l[0] * c[1], cos = Math.cos(q2);
  const kinetic = 0.5 * ((J1 + J2 + m[1] * l[0] * l[0] + 2 * k * cos) * w1 * w1 + 2 * (J2 + k * cos) * w1 * w2 + J2 * w2 * w2);
  return kinetic - g * (m[0] * c[0] + m[1] * l[0]) * Math.cos(q1) - g * m[1] * c[1] * Math.cos(q1 + q2);
}

/** `a` onto (-π, π]. */
export const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** How far the state is from upright, whichever way round it came. */
export const fromUpright = ([q1, q2, w1, w2]: X): X => [wrap(q1 - Math.PI), wrap(q2), w1, w2];
