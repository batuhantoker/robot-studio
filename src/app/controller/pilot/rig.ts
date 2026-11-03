/**
 * What a robot drives with: its legs (a stepping gait sized from leg length) or its wheels (spin and
 * steering joints read off each wheel chain), and the limits that follow from them.
 */
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import { type Vec3, cross, dot } from '../../../core/math/linear/vec';
import type { Body, BodyPart } from '../../../core/motion/body';
import { type GaitSpec, type Wheel, gaitTopSpeed, gaitTopTurn, maxCurvature } from '../../../core/motion/locomotion';
import { gaitPhases } from '../../../core/motion/paths/gait';
import { readyPose } from '../../../core/motion/ready';
import { limbRoles } from '../../../core/motion/roles';
import { solveWholeBody } from '../../../core/solvers/ik/multi';
import type { RobotSession } from '../../robots/session';

const UP: Vec3 = [0, 0, 1];

export interface LegRig {
  kind: 'legs';
  gait: GaitSpec;
  /** Limb of each gait leg, in gait order. */
  legs: number[];
  /** Humanoid arms swing against the opposite leg: hand limb, its rest point, and which gait leg drives it. */
  arms: { limb: number; home: Vec3; leg: number }[];
  /** Per gait leg with an ankle, the foot-frame axis kept vertical so the sole stays flat. */
  level: (Vec3 | undefined)[];
}

export interface WheelRig {
  kind: 'wheels';
  wheels: Wheel[];
  /** Tightest curvature (steered robots), or 0 for skid and differential drive. */
  curvature: number;
}

export interface PilotRig {
  drive: LegRig | WheelRig;
  forward: Vec3;
  /** Pose the drive starts from and settles back to. */
  ready: number[];
  topSpeed: number;
  topTurn: number;
}

const tipOf = (s: RobotSession, limb: number, q: number[]) => chainFrames(s.limbs[limb].chain, limbQ(s.limbs[limb], q)).tip.p;

function legRig(s: RobotSession, body: Body, legs: BodyPart[]): PilotRig {
  const len = legs.reduce((a, p) => a + p.role.length, 0) / legs.length;
  // Position-only foot targets let a bent knee tip the foot, and settling then stands the robot on its toes.
  const level = legs.map((p) => {
    if (s.limbs[p.limb].index.length < 5) return undefined;
    const R = chainFrames(s.limbs[p.limb].chain, limbQ(s.limbs[p.limb], s.home)).tip.R;
    return [R[6], R[7], R[8]] as Vec3;
  });
  const roles = limbRoles(s, s.home);
  const eased = readyPose(s, s.home, roles);
  // Knees a little bent: a straight leg cannot lift its foot without first folding.
  const crouch = 0.05 * len;
  const targets = legs.map((p, i) => {
    const t = tipOf(s, p.limb, s.home);
    return { limb: p.limb, point: [t[0], t[1], t[2] + crouch] as Vec3, level: level[i] };
  });
  const ready = solveWholeBody(s.limbs, s.joints, targets, eased, { restarts: 0, maxIter: 150 }).q;
  const quad = legs.length >= 4;
  const period = Math.min(Math.max(1.2 * Math.sqrt(len / 0.9), 0.45), 1.5) * (quad ? 0.7 : 1);
  const phases = gaitPhases(legs.map((p) => p.role), legs.length === 2 ? 'march' : quad && legs.length === 4 ? 'trot' : 'tripod');
  const homes = legs.map((p) => tipOf(s, p.limb, ready));
  const lift = (quad ? 0.14 : 0.1) * len;
  // The longest stride every foot can reach at both ends, to either side (turns slide feet sideways), and at the top of its swing.
  const left = cross(UP, body.forward);
  const reaches = (stride: number) => legs.every((p, i) => [[-0.5, 0, 0], [0.5, 0, 0], [0, -0.4, 0], [0, 0.4, 0], [0, 0, lift]].every(([k, j, up]) => {
    const point: Vec3 = [0, 1, 2].map((a) => homes[i][a] + body.forward[a] * k * stride + left[a] * j * stride) as Vec3;
    point[2] += up;
    return solveWholeBody(s.limbs, s.joints, [{ limb: p.limb, point, level: level[i] }], ready, { restarts: 0, maxIter: 120 }).residual < 3e-3;
  }));
  const stride = ([0.35, 0.3, 0.25, 0.2, 0.15].find((k) => reaches(k * len)) ?? 0.12) * len;
  const gait: GaitSpec = {
    legs: homes.map((home, i) => ({ home, offset: phases[i] })),
    period, lift, stride, forward: body.forward,
  };
  const arms = s.category === 'humanoid' && legs.length === 2
    ? body.parts.filter((p) => p.kind === 'arm' && p.side !== 'centre').map((p) => ({
      limb: p.limb, home: tipOf(s, p.limb, ready), leg: legs.findIndex((l) => l.side !== p.side),
    })).filter((a) => a.leg >= 0)
    : [];
  return { drive: { kind: 'legs', gait, legs: legs.map((p) => p.limb), arms, level }, forward: body.forward, ready, topSpeed: gaitTopSpeed(gait), topTurn: gaitTopTurn(gait) };
}

function wheelRig(s: RobotSession, body: Body, parts: BodyPart[], ground: number): PilotRig {
  const left = cross(UP, body.forward);
  const chains = parts.map((p) => s.limbs[p.limb]);
  const uses = new Map<number, number>();
  for (const l of chains) for (const i of l.index) uses.set(i, (uses.get(i) ?? 0) + 1);
  const wheels: Wheel[] = [];
  let maxSteer = 0.6;
  chains.forEach((l) => {
    const f = chainFrames(l.chain, limbQ(l, s.home));
    const hinge = (k: number) => l.chain.joints[k].type === 'hinge';
    const ks = l.chain.joints.map((_, k) => k).reverse();
    const spin = ks.find((k) => hinge(k) && Math.abs(f.axes[k][2]) < 0.5);
    if (spin === undefined) return;
    // A wheel's own vertical hinge steers it; one shared with other wheels is a rocker or a turret.
    const steer = ks.find((k) => k !== spin && hinge(k) && Math.abs(f.axes[k][2]) > 0.8 && uses.get(l.index[k]) === 1);
    if (steer !== undefined) {
      const [lo, hi] = l.chain.joints[steer].limits;
      maxSteer = Math.min(maxSteer, Math.abs(lo), Math.abs(hi));
    }
    const tip = f.tip.p;
    wheels.push({
      spin: l.index[spin], spinSign: Math.sign(dot(f.axes[spin], left)) || 1,
      steer: steer === undefined ? null : l.index[steer], steerSign: Math.sign(f.axes[steer ?? 0][2]) || 1,
      at: [tip[0], tip[1], ground], radius: Math.min(Math.max(tip[2] - ground, 0.01), 1),
    });
  });
  const r = wheels.reduce((a, w) => a + w.radius, 0) / Math.max(wheels.length, 1);
  const topSpeed = Math.min(Math.max(8 * r, 0.3), 2.5);
  const curvature = maxCurvature(wheels, body.forward, Math.max(maxSteer, 0.05));
  const cy = wheels.reduce((a, w) => a + dot(w.at, left), 0) / Math.max(wheels.length, 1);
  const track = Math.max(...wheels.map((w) => Math.abs(dot(w.at, left) - cy)), 0.05);
  const topTurn = curvature > 0 ? topSpeed * curvature : Math.min(Math.max(topSpeed / track, 0.6), 2.5);
  return { drive: { kind: 'wheels', wheels, curvature }, forward: body.forward, ready: [...s.home], topSpeed, topTurn };
}

/** Null for robots with nothing to walk or roll on (arms, hands, a hexapod whose legs read as arms still walks). */
export function pilotRig(s: RobotSession, body: Body, ground: number): PilotRig | null {
  if (s.category === 'aerial') return null;
  const legs = body.parts.filter((p) => p.kind === 'leg');
  const wheels = body.parts.filter((p) => p.kind === 'wheel');
  if (legs.length >= 2 && (legs.length >= wheels.length || s.category !== 'mobile')) return legRig(s, body, legs);
  if (wheels.length >= 2) return wheelRig(s, body, wheels, ground);
  return null;
}
