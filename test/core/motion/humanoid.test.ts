import { describe, expect, it } from 'vitest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { limbQ, mergeLimbs } from '@/core/chain/limbs/types';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import type { Vec3 } from '@/core/math/linear/vec';
import { bodyOf, workStance } from '@/core/motion/body';
import { slalom, wheelsOf } from '@/core/motion/generators/steer';
import { presetsFor } from '@/core/motion/presets';
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

describe('humanoid work presets', () => {
  it('offers bench work, a two-hand lift and turn & place, and leaves the head and legs alone', () => {
    const { robot, q0 } = humanoid();
    const presets = presetsFor(robot, q0, 'humanoid');
    expect(presets.map((p) => p.id)).toEqual(expect.arrayContaining(['bench', 'lift', 'turn', 'reach', 'wave']));
    const [L, R, head] = [index(robot, 'left_hand'), index(robot, 'right_hand'), index(robot, 'head_camera')];
    const waist = robot.joints.findIndex((j) => j.name === 'waist_yaw');
    const neck = robot.joints.findIndex((j) => j.name === 'neck');
    const legs = robot.joints.flatMap((j, i) => (/leg|hip|knee|ankle/.test(j.name) ? [i] : []));
    for (const id of ['bench', 'lift', 'turn']) {
      const clip = presets.find((p) => p.id === id)!.build(robot, q0, 1);
      const qs = Array.from({ length: 40 }, (_, k) => clip.at((k / 40) * clip.period));
      for (const q of qs) {
        expect(q[neck]).toBeCloseTo(q0[neck], 9);
        expect(Math.max(...legs.map((i) => Math.abs(q[i] - qs[0][i])))).toBeLessThan(1e-9);
        if (id !== 'turn') expect(q[waist]).toBeCloseTo(qs[0][waist], 9);
      }
      // Hands go out over the bench in front, and the loop closes.
      expect(Math.max(...qs.map((q) => Math.max(tip(robot, q, L)[0], tip(robot, q, R)[0])))).toBeGreaterThan(tip(robot, q0, L)[0] + 0.1);
      clip.at(0).forEach((v, i) => expect(v).toBeCloseTo(clip.at(clip.period)[i], 6));
      if (id === 'turn') expect(Math.max(...qs.map((q) => Math.abs(q[waist])))).toBeGreaterThan(0.4);
    }
    expect(tip(robot, q0, head)[2]).toBeGreaterThan(1.4);
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
    const session = { ...robot, id: 'h', home: q0, category: 'humanoid', base: 'floating', collision: null, assembly: { floorZ: 0 } } as unknown as RobotSession;
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
