import { describe, expect, it } from 'vitest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { limbQ, mergeLimbs } from '@/core/chain/limbs/types';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import type { Vec3 } from '@/core/math/linear/vec';
import { bodyOf, workStance } from '@/core/motion/body';
import { slalom, wheelsOf } from '@/core/motion/generators/steer';
import { presetsFor } from '@/core/motion/presets';
import { standingStops } from '@/core/motion/stand-stops';
import type { MotionRobot } from '@/core/motion/types';
import { parseRobot } from '@/core/robot/schema/parse';
import { solveWholeBody } from '@/core/solvers/ik/multi';
import { arrange, taskSetup, wholeBody } from '@/app/controller/task/setup';
import type { RobotSession } from '@/app/robots/session';
import { isClip, planTask } from '@/core/task/plan/check';

type Link = { name: string; axis: Vec3; offset: Vec3; limits?: [number, number] };
const chain = (base: Vec3, links: Link[], tool: Vec3 = [0, 0, 0]) =>
  chainFromSpec(parseRobot({ units: 'SI', base, tool, links: links.map((l) => ({ mass: 0.4, limits: [-2.6, 2.6], ...l })) }));

const LEG: Link[] = [
  { name: 'hip_pitch', axis: [0, 1, 0], offset: [0, 0, 0] },
  { name: 'hip_roll', axis: [1, 0, 0], offset: [0, 0, 0] },
  { name: 'knee', axis: [0, 1, 0], offset: [0, 0, -0.42], limits: [0, 2.4] },
  { name: 'ankle', axis: [0, 1, 0], offset: [0, 0, -0.42] },
];
const leg = (side: number): Link[] => LEG.map((l) => ({ ...l, name: `${side > 0 ? 'left' : 'right'}_${l.name}` }));

// Arms hang straight with the elbow on its stop, from a waist yaw both share: the hard case for warm-started IK.
const arm = (side: number): Link[] => [
  { name: 'waist_yaw', axis: [0, 0, 1], offset: [0, 0, 0] },
  { name: 'shoulder_pitch', axis: [0, 1, 0], offset: [0, side * 0.18, 0.38] },
  { name: 'shoulder_roll', axis: [1, 0, 0], offset: [0, 0, 0], limits: side > 0 ? [0, 2.6] : [-2.6, 0] },
  { name: 'shoulder_yaw', axis: [0, 0, 1], offset: [0, 0, -0.14] },
  { name: 'elbow', axis: [0, 1, 0], offset: [0, 0, -0.14], limits: [-2.4, 0] },
];

/** Legs to the floor, two arms on a shared waist, a head on the same waist, and a fingertip branch off the right hand. */
function humanoid(): { robot: MotionRobot; q0: number[] } {
  const parts = [
    { name: 'left_leg_ankle', chain: chain([0, 0.1, 0.9], leg(1), [0, 0, -0.04]), keys: leg(1).map((l) => l.name) },
    { name: 'right_leg_ankle', chain: chain([0, -0.1, 0.9], leg(-1), [0, 0, -0.04]), keys: leg(-1).map((l) => l.name) },
    { name: 'left_hand', chain: chain([0, 0, 0.95], arm(1), [0, 0, -0.24]), keys: arm(1).map((l) => (l.name === 'waist_yaw' ? l.name : `l_${l.name}`)) },
    { name: 'right_hand', chain: chain([0, 0, 0.95], arm(-1), [0, 0, -0.24]), keys: arm(-1).map((l) => (l.name === 'waist_yaw' ? l.name : `r_${l.name}`)) },
    { name: 'right_index_tip', chain: chain([0, 0, 0.95], [...arm(-1), { name: 'index', axis: [0, 1, 0], offset: [0, 0, -0.22] }], [0, 0, -0.05]),
      keys: [...arm(-1).map((l) => (l.name === 'waist_yaw' ? l.name : `r_${l.name}`)), 'r_index'] },
    { name: 'head_camera', chain: chain([0, 0, 0.95], [arm(1)[0], { name: 'neck', axis: [0, 1, 0], offset: [0, 0, 0.5] }, { name: 'nod', axis: [1, 0, 0], offset: [0, 0, 0.05] }], [0.05, 0, 0.1]),
      keys: ['waist_yaw', 'neck', 'nod'] },
  ];
  const { joints, limbs } = mergeLimbs(parts);
  const q0 = joints.map((j) => (j.name.endsWith('knee') ? 0.25 : j.name.endsWith('hip_pitch') ? -0.12 : j.name.endsWith('ankle') ? -0.13 : 0));
  return { robot: { joints, limbs }, q0 };
}

const tip = (r: MotionRobot, q: number[], limb: number) => chainFrames(r.limbs[limb].chain, limbQ(r.limbs[limb], q)).tip.p;
const index = (r: MotionRobot, name: string) => r.limbs.findIndex((l) => l.name === name);

describe('a humanoid read as a body', () => {
  it('names one part per end effector, faces +x, and keeps a fingertip branch with its hand', () => {
    const { robot, q0 } = humanoid();
    const b = bodyOf(robot, q0, 'humanoid');
    expect(b.parts.map((p) => p.label).sort()).toEqual(['Head', 'Left arm', 'Left leg', 'Right arm', 'Right leg']);
    expect(b.forward).toEqual([1, 0, 0]);
    expect(b.labels[index(robot, 'right_index_tip')]).toMatch(/^Right arm · /);
    expect(b.partOf[index(robot, 'right_index_tip')]).toBe(b.partOf[index(robot, 'right_hand')]);
  });

  it('puts the bench between the hips and the shoulders, a step ahead of the feet', () => {
    const { robot, q0 } = humanoid();
    const b = bodyOf(robot, q0, 'humanoid');
    const st = workStance(b);
    expect(st.hand).toBeGreaterThan(b.ground + 0.4);
    expect(st.hand).toBeLessThan(1.33);
    expect(st.front).toBeGreaterThan(0);
  });
});

describe('humanoid motions', () => {
  it('offers nothing that works on objects it does not have, or swings joints for their own sake', () => {
    const { robot, q0 } = humanoid();
    const ids = presetsFor(robot, q0, 'humanoid').map((p) => p.id);
    expect(ids).toContain('wave');
    for (const gone of ['bench', 'lift', 'turn', 'reach', 'wave-joints']) expect(ids).not.toContain(gone);
  });

  it('waves the right hand up beside the head and leaves the rest of the robot alone', () => {
    const { robot, q0 } = humanoid();
    const clip = presetsFor(robot, q0, 'humanoid').find((p) => p.id === 'wave')!.build(robot, q0, 1);
    const R = index(robot, 'right_hand'), L = index(robot, 'left_hand');
    const own = new Set(robot.limbs[R].index.filter((i) => !robot.limbs[L].index.includes(i)));
    const qs = Array.from({ length: 60 }, (_, k) => clip.at((k / 60) * clip.period));
    for (const q of qs) q.forEach((v, i) => own.has(i) || expect(v).toBeCloseTo(q0[i], 9));
    const rest = tip(robot, q0, R)[2], heights = qs.map((q) => tip(robot, q, R)[2]);
    expect(Math.max(...heights)).toBeGreaterThan(rest + 0.3);
    // The hand goes across and back while it is up, and the loop rests where it started.
    const up = qs.filter((_, k) => heights[k] > rest + 0.25).map((q) => tip(robot, q, R)[1]);
    expect(Math.max(...up) - Math.min(...up)).toBeGreaterThan(0.04);
    qs[0].forEach((v, i) => expect(v).toBeCloseTo(q0[i], 6));
  });

  it('crouches over its feet and brings the hands up for its default stops', () => {
    const { robot, q0 } = humanoid();
    const body = bodyOf(robot, q0, 'humanoid');
    const stops = standingStops(robot, q0, body)!;
    expect(stops[0]).toEqual(q0);
    expect(stops.at(-1)).toEqual(q0);
    const legs = body.parts.filter((p) => p.kind === 'leg').map((p) => p.limb);
    const frames = (q: number[], limb: number) => chainFrames(robot.limbs[limb].chain, limbQ(robot.limbs[limb], q)).tip;
    const rise = legs.map((l) => frames(stops[1], l).p[2] - frames(q0, l).p[2]);
    expect(rise[0]).toBeGreaterThan(0.05);
    expect(rise[1]).toBeCloseTo(rise[0], 2);
    for (const l of legs) {
      expect(frames(stops[1], l).p[0]).toBeCloseTo(frames(q0, l).p[0], 2);
      expect(frames(stops[1], l).p[1]).toBeCloseTo(frames(q0, l).p[1], 2);
    }
    const R = index(robot, 'right_hand');
    expect(tip(robot, stops[2], R)[2]).toBeGreaterThan(tip(robot, q0, R)[2] + 0.1);
  });
});

describe('whole-body IK', () => {
  it('holds fixed joints and gets a straight elbow off its stop', () => {
    const { robot, q0 } = humanoid();
    const R = index(robot, 'right_hand'), waist = robot.joints.findIndex((j) => j.name === 'waist_yaw');
    const goal: Vec3 = [0.3, -0.2, 1.05];
    const r = solveWholeBody(robot.limbs, robot.joints, [{ limb: R, point: goal }], q0, { restarts: 0, maxIter: 200, fixed: new Set([waist]) });
    expect(r.success).toBe(true);
    expect(r.q[waist]).toBe(q0[waist]);
  });
});

describe('a steered car', () => {
  const wheel = (name: string, x: number, y: number, steer: boolean) => ({
    name, chain: chain([x, y, 0.2], [
      ...(steer ? [{ name: `${name}_steer`, axis: [0, 0, 1] as Vec3, offset: [0, 0, 0] as Vec3, limits: [-0.6, 0.6] as [number, number] }] : []),
      { name: `${name}_spin`, axis: [0, 1, 0] as Vec3, offset: [0, 0, 0] as Vec3 },
    ]), keys: [...(steer ? [`${name}_steer`] : []), `${name}_spin`],
  });

  for (const fourWheel of [false, true]) {
    it(`turns its inside front wheel harder than the outside one${fourWheel ? ', and counter-steers the rear' : ''}`, () => {
      const parts = [wheel('front_left_wheel', 0.5, 0.3, true), wheel('front_right_wheel', 0.5, -0.3, true), wheel('rear_left_wheel', -0.5, 0.3, fourWheel), wheel('rear_right_wheel', -0.5, -0.3, fourWheel)];
      const { joints, limbs } = mergeLimbs(parts);
      joints.forEach((j) => j.name.endsWith('spin') && (j.continuous = true));
      limbs.forEach((l) => l.chain.joints.forEach((j) => j.name.endsWith('spin') && (j.continuous = true)));
      const robot = { joints, limbs }, q0 = joints.map(() => 0);
      const body = bodyOf(robot, q0, 'mobile');
      const wheels = wheelsOf(robot, q0, body);
      expect(wheels.filter((w) => w.steer !== null)).toHaveLength(fourWheel ? 4 : 2);
      const clip = slalom(robot, q0, wheels, 1);
      const q = clip.at(clip.period / 4);
      const angle = (name: string) => q[joints.findIndex((j) => j.name === `${name}_steer`)];
      // A quarter period in, the car turns left: the left front wheel is on the inside.
      expect(angle('front_left_wheel')).toBeGreaterThan(angle('front_right_wheel'));
      expect(angle('front_right_wheel')).toBeGreaterThan(0);
      if (fourWheel) expect(angle('rear_left_wheel')).toBeLessThan(0);
    });
  }
});

describe('pick and place with a humanoid hand', () => {
  it('works with the right hand at the bench, legs planted, as a whole-robot cycle', () => {
    const { robot, q0 } = humanoid();
    // A real hand is a rig on the arm's limb: Pick & place closes it; nothing carries in a bare palm.
    const hand = { kind: 'parallel', size: 0.04, grip: { min: 0, max: 0.08, rest: 0.08, set: () => {} }, tool: { approach: [0, 0, -1], side: [0, 1, 0], beyond: 0 } };
    const rigs = robot.limbs.map((l) => (/_hand$/.test(l.name) ? hand : null));
    const session = { ...robot, id: 'h', home: q0, category: 'humanoid', base: 'floating', collision: null, assembly: { floorZ: 0 }, grips: true, rigs } as unknown as RobotSession;
    const found = taskSetup(session, -1)!;
    expect(found.label).toBe('Right arm');
    const { setup: t, spots } = arrange(found);
    expect(spots).not.toBeNull();
    const bench = workStance(bodyOf(robot, q0, 'humanoid')).hand;
    expect(Math.abs(spots![0][2] - bench)).toBeLessThan(0.2);
    const plan = planTask({ ctx: t.ctx, home: t.home, pick: spots![0], place: spots![1], object: t.object, lift: t.lift, base: t.base }, t.probe);
    expect(isClip(plan)).toBe(true);
    if (!isClip(plan)) return;
    const clip = wholeBody(plan, t.expand!);
    const legs = robot.joints.flatMap((j, i) => (/hip|knee|ankle/.test(j.name) ? [i] : []));
    for (let k = 0; k < 30; k++) {
      const q = clip.at((k / 30) * clip.period).q;
      expect(q).toHaveLength(robot.joints.length);
      legs.forEach((i) => expect(q[i]).toBe(q0[i]));
    }
  });
});
