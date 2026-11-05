/** A row of hanging pendulums has no tool or feet to plan with: its motions are phases running along the row. */
import { chainFrames } from '../../chain/kinematics/frames';
import { limbQ } from '../../chain/limbs/types';
import type { MotionClip, MotionPreset, MotionRobot } from '../types';

/** Joints of a row of single-hinge limbs, in order along it; null for anything else. */
export function pendulumRow(robot: MotionRobot, q0: number[]): number[] | null {
  const { limbs } = robot;
  if (limbs.length < 3 || limbs.some((l) => l.index.length !== 1 || l.chain.joints[0].type !== 'hinge')) return null;
  const pivots = limbs.map((l) => chainFrames(l.chain, limbQ(l, q0)).origins[0]);
  const spread = [0, 1, 2].map((a) => Math.max(...pivots.map((p) => p[a])) - Math.min(...pivots.map((p) => p[a])));
  const along = spread.indexOf(Math.max(...spread));
  return limbs.map((l, i) => ({ joint: l.index[0], at: pivots[i][along] })).sort((a, b) => a.at - b.at).map((p) => p.joint);
}

const TAU = 2 * Math.PI;
/** Starting mid-swing would jump every pendulum off its rest pose. */
const SETTLE_IN = 1.2;

type Swing = (k: number, n: number, t: number) => number;

function clip(robot: MotionRobot, q0: number[], row: number[], size: number, period: number, swing: Swing): MotionClip {
  const amp = row.map((j) => Math.min(0.55 * size, robot.joints[j].limits[1] - q0[j], q0[j] - robot.joints[j].limits[0]));
  return {
    period,
    at: (t) => {
      const q = [...q0], ease = Math.min(t / SETTLE_IN, 1);
      row.forEach((j, k) => (q[j] = q0[j] + ease * amp[k] * swing(k, row.length, t)));
      return q;
    },
  };
}

const WAVE_CYCLES = 20;
const WAVE_PERIOD = 30;

export function pendulumPresets(row: number[]): MotionPreset[] {
  const preset = (id: string, label: string, hint: string, period: number, swing: Swing): MotionPreset =>
    ({ id, label, hint, build: (robot, q0, size) => clip(robot, q0, row, size, period, swing) });
  return [
    preset('wave', 'Pendulum wave', 'Each swings a little faster than the last: they drift apart and line up again', WAVE_PERIOD,
      (k, _, t) => Math.sin((TAU * (WAVE_CYCLES + k) * t) / WAVE_PERIOD)),
    preset('together', 'All together', 'The whole row swings as one', 1.6, (_k, _n, t) => Math.sin((TAU * t) / 1.6)),
    preset('travel', 'Travelling wave', 'A wave runs down the row', 2.4, (k, n, t) => Math.sin(TAU * (t / 2.4 - k / n))),
    preset('alternate', 'Alternate', 'Neighbours swing opposite ways', 1.6, (k, _, t) => (k % 2 ? -1 : 1) * Math.sin((TAU * t) / 1.6)),
    preset('pulse', 'Pulse', 'One bump runs along the row and back', 4, (k, n, t) => {
      const head = (1 - Math.abs(((t / 4) % 1) * 2 - 1)) * (n - 1);
      return Math.exp(-(((k - head) / 1.6) ** 2));
    }),
  ];
}
