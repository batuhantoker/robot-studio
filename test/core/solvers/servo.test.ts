import { describe, expect, it } from 'vitest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { singleLimb } from '@/app/robots/single-limb';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { limbQ } from '@/core/chain/limbs/types';
import type { Vec3 } from '@/core/math/linear/vec';
import { rotationError } from '@/core/motion/stepping/limb-pose';
import { parseRobot } from '@/core/robot/schema/parse';
import { servo } from '@/core/solvers/ik/servo';

type Link = { name: string; axis: Vec3; offset: Vec3; limits?: [number, number] };

const arm = (links: Link[]) => {
  const chain = chainFromSpec(parseRobot({ units: 'SI', base: [0, 0, 0], tool: [0, 0, 0], links: links.map((l) => ({ mass: 0.5, limits: [-3, 3], ...l })) }));
  const { limbs, joints } = singleLimb(chain);
  return { limb: limbs[0], joints };
};

/** A spherical-wrist six-axis arm, bent at the start. */
const six = () => arm([
  { name: 'j1', axis: [0, 0, 1], offset: [0, 0, 0.3] },
  { name: 'j2', axis: [0, 1, 0], offset: [0, 0, 0.4] },
  { name: 'j3', axis: [0, 1, 0], offset: [0.35, 0, 0] },
  { name: 'j4', axis: [1, 0, 0], offset: [0.05, 0, 0] },
  { name: 'j5', axis: [0, 1, 0], offset: [0.05, 0, 0] },
  { name: 'j6', axis: [1, 0, 0], offset: [0.08, 0, 0] },
]);
const BENT = [0.2, 0.5, 0.9, 0.1, -0.6, 0.1];
const STEP = 1 / 60 * 2;

const tip = (a: ReturnType<typeof six>, q: number[]) => chainFrames(a.limb.chain, limbQ(a.limb, q)).tip;

describe('driving a tool', () => {
  it('reaches a nearby goal and keeps the orientation it was asked to', () => {
    const a = six();
    const start = tip(a, BENT), goal: Vec3 = [start.p[0] + 0.06, start.p[1] - 0.05, start.p[2] + 0.04];
    let q = BENT;
    for (let i = 0; i < 240; i++) q = servo(a.limb, a.joints, q, { p: goal, R: start.R }, { maxStep: STEP }).q;
    const end = tip(a, q);
    expect(Math.hypot(...end.p.map((v, i) => v - goal[i]))).toBeLessThan(1e-3);
    expect(Math.hypot(...rotationError(start.R, end.R))).toBeLessThan(5e-3);
  });

  it('never moves a joint faster than the cap, however far the goal', () => {
    const a = six();
    let q = BENT;
    for (let i = 0; i < 200; i++) {
      const next = servo(a.limb, a.joints, q, { p: [3, 2, 1], R: tip(a, BENT).R }, { maxStep: STEP }).q;
      next.forEach((v, k) => expect(Math.abs(v - q[k])).toBeLessThanOrEqual(STEP + 1e-9));
      q = next;
    }
  });

  it('slows through a singularity instead of flinging the joints, and says it has run out of reach', () => {
    const a = six();
    let q = BENT, stop = null;
    for (let i = 0; i < 900; i++) {
      const r = servo(a.limb, a.joints, q, { p: [3, 0, 0.7] }, { maxStep: STEP });
      q.forEach((v, k) => expect(Math.abs(r.q[k] - v)).toBeLessThanOrEqual(STEP + 1e-9));
      q = r.q;
      stop = r.stop;
    }
    expect(stop).toEqual({ kind: 'reach' });
    expect(Math.hypot(...tip(a, q).p)).toBeGreaterThan(0.75);
  });

  it('names the joint on its stop', () => {
    const a = arm([
      { name: 'j1', axis: [0, 0, 1], offset: [0.4, 0, 0], limits: [-0.3, 0.3] },
      { name: 'j2', axis: [0, 0, 1], offset: [0.3, 0, 0], limits: [0.5, 0.5001] },
    ]);
    let q = [0, 0.5], stop = null;
    for (let i = 0; i < 300; i++) {
      const r = servo(a.limb, a.joints, q, { p: [-0.5, 0.5, 0] }, { maxStep: STEP });
      q = r.q;
      stop = r.stop;
    }
    expect(stop?.kind).toBe('limit');
    expect(a.joints.map((j) => j.limits)[0]).toEqual([-0.3, 0.3]);
    expect(q[0]).toBeCloseTo(0.3, 6);
  });

  it('leaves held joints alone, and drifts spare joints back to the posture', () => {
    const a = arm([
      { name: 'j1', axis: [0, 0, 1], offset: [0.3, 0, 0] },
      { name: 'j2', axis: [0, 0, 1], offset: [0.3, 0, 0] },
      { name: 'j3', axis: [0, 0, 1], offset: [0.3, 0, 0] },
      { name: 'j4', axis: [0, 0, 1], offset: [0.3, 0, 0] },
    ]);
    const start = [0.1, 0.4, -0.5, 0.3], goal = tip(a, start).p;
    const held = servo(a.limb, a.joints, start, { p: [0.7, 0.4, 0] }, { maxStep: STEP, held: new Set([1]) });
    expect(held.q[1]).toBe(start[1]);
    const posture = [0.2, 0.3, -0.4, 0.2];
    const circling = (i: number): Vec3 => [goal[0] + 0.01 * Math.sin(i / 20), goal[1] + 0.01 * Math.cos(i / 20), 0];
    let q = start;
    for (let i = 0; i < 400; i++) q = servo(a.limb, a.joints, q, { p: circling(i) }, { maxStep: STEP, posture }).q;
    expect(Math.hypot(...tip(a, q).p.map((v, i) => v - circling(399)[i]))).toBeLessThan(5e-3);
    const before = Math.hypot(...start.map((v, i) => v - posture[i])), after = Math.hypot(...q.map((v, i) => v - posture[i]));
    expect(after).toBeLessThan(0.5 * before);
  });

  it('holds perfectly still at its goal: an idle arm does not creep', () => {
    const a = six();
    const r = servo(a.limb, a.joints, BENT, { p: tip(a, BENT).p, R: tip(a, BENT).R }, { maxStep: STEP, posture: [0, 0, 0, 0, 0, 0] });
    expect(r.q).toEqual(BENT);
    expect(r.stop).toBeNull();
  });

  it('drives a point past the tip when one is given', () => {
    const a = six();
    const point: Vec3 = [0.1, 0, 0], T = tip(a, BENT);
    const at = T.p.map((v, i) => v + T.R[3 * i] * 0.1) as Vec3;
    const r = servo(a.limb, a.joints, BENT, { p: at }, { maxStep: STEP, point });
    expect(r.left).toBeLessThan(1e-4);
    r.q.forEach((v, k) => expect(v).toBeCloseTo(BENT[k], 6));
  });
});
