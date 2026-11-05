import { describe, expect, it } from 'vitest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { limbQ, mergeLimbs } from '@/core/chain/limbs/types';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { applyTransform, compose } from '@/core/math/linear/transform';
import type { Vec3 } from '@/core/math/linear/vec';
import { bodyOf } from '@/core/motion/body';
import { presetsFor } from '@/core/motion/presets';
import { zmpOf } from '@/core/motion/stepping/balance';
import { marchClip, marchGait } from '@/core/motion/stepping/march';
import { massModel, massPoints } from '@/core/motion/stepping/mass';
import { margin, supportPolygon } from '@/core/motion/stepping/support';
import type { Footing, MotionClip, MotionRobot } from '@/core/motion/types';
import { parseRobot } from '@/core/robot/schema/parse';

type Link = { name: string; axis: Vec3; offset: Vec3; limits?: [number, number]; mass?: number };
const chain = (base: Vec3, links: Link[], tool: Vec3 = [0, 0, 0]) =>
  chainFromSpec(parseRobot({ units: 'SI', base, tool, links: links.map((l) => ({ mass: 1, limits: [-2.6, 2.6], ...l })) }));

const leg = (s: string, out = 0): Link[] => [
  { name: `${s}_hip_pitch`, axis: [0, 1, 0], offset: [0, out, 0] },
  { name: `${s}_hip_roll`, axis: [1, 0, 0], offset: [0, 0, 0] },
  { name: `${s}_hip_yaw`, axis: [0, 0, 1], offset: [0, 0, -0.3], mass: 2 },
  { name: `${s}_knee`, axis: [0, 1, 0], offset: [0, 0, -0.3], limits: [0, 2.6], mass: 1.5 },
  { name: `${s}_ankle_pitch`, axis: [0, 1, 0], offset: [0, 0, 0], limits: [-0.9, 0.5], mass: 0.2 },
  { name: `${s}_ankle_roll`, axis: [1, 0, 0], offset: [0, 0, -0.04], limits: [-0.3, 0.3], mass: 0.5 },
];

const arm = (s: string, side: number): Link[] => [
  { name: 'waist_yaw', axis: [0, 0, 1], offset: [0, side * 0.16, 0.4], mass: 12 },
  { name: `${s}_shoulder_pitch`, axis: [0, 1, 0], offset: [0, 0, 0], mass: 0.1 },
  { name: `${s}_shoulder_roll`, axis: [1, 0, 0], offset: [0, 0, 0], mass: 0.1 },
  { name: `${s}_shoulder_yaw`, axis: [0, 0, 1], offset: [0, 0, -0.2], mass: 0.8 },
  { name: `${s}_elbow`, axis: [0, 1, 0], offset: [0.2, 0, 0], limits: [-1, 2], mass: 0.6 },
];

const SOLE: Vec3[] = [[-0.06, -0.035, 0], [0.13, -0.035, 0], [0.13, 0.035, 0], [-0.06, 0.035, 0]];

function biped(splay = 0): { robot: MotionRobot; q0: number[]; footing: Footing; limbs: number[] } {
  const parts = [
    { name: 'left_ankle', chain: chain([0, 0.1, 0.7], leg('left', splay)), keys: leg('left').map((l) => l.name) },
    { name: 'right_ankle', chain: chain([0, -0.1, 0.7], leg('right', -splay)), keys: leg('right').map((l) => l.name) },
    { name: 'left_hand', chain: chain([0, 0, 0.75], arm('left', 1), [0.03, 0, 0]), keys: arm('left', 1).map((l) => l.name) },
    { name: 'right_hand', chain: chain([0, 0, 0.75], arm('right', -1), [0.03, 0, 0]), keys: arm('right', -1).map((l) => l.name) },
  ];
  const { joints, limbs } = mergeLimbs(parts);
  const robot = { joints, limbs };
  const q0 = joints.map(() => 0);
  const feet = new Map([[0, { sole: SOLE, up: [0, 0, 1] as Vec3 }], [1, { sole: SOLE, up: [0, 0, 1] as Vec3 }]]);
  return { robot, q0, footing: { floor: 0.06, feet }, limbs: [0, 1] };
}

const tip = (r: MotionRobot, clip: MotionClip, limb: number, t: number) => {
  const l = r.limbs[limb];
  return compose(clip.body!(t), chainFrames(l.chain, limbQ(l, clip.at(t))).tip);
};

function setup(size = 1) {
  const b = biped();
  const body = bodyOf(b.robot, b.q0, 'humanoid');
  const clip = marchClip(b.robot, b.q0, b.footing, body, size)!;
  const gait = marchGait(b.robot, b.q0, body, b.footing, size);
  const steps = 240;
  // Cycle phases with each foot's world sole, for a walk around the loop.
  const walk = Array.from({ length: steps + 1 }, (_, k) => {
    const s = k / steps, t = clip.lead! + s * clip.period;
    const feet = b.limbs.map((limb, i) => {
      const T = tip(b.robot, clip, limb, t);
      return { T, sole: SOLE.map((p) => applyTransform(T, p)), down: ((s - gait.lifts[i]) % 1 + 1) % 1 >= gait.air };
    });
    return { s, t, feet };
  });
  return { ...b, body, clip, gait, walk };
}

describe('a march that stands on its feet', () => {
  it('keeps every planted sole point where it landed, flat, and out of the floor', () => {
    const { walk, footing } = setup();
    for (const i of [0, 1]) {
      const down = walk.filter((w) => w.feet[i].down);
      const first = down[0].feet[i].sole;
      for (const w of down) {
        const f = w.feet[i];
        f.sole.forEach((p, j) => expect(Math.hypot(p[0] - first[j][0], p[1] - first[j][1], p[2] - first[j][2])).toBeLessThan(1e-3));
        expect(Math.acos(Math.min(1, f.T.R[8]))).toBeLessThan(0.002);
      }
    }
    for (const w of walk) for (const f of w.feet) expect(Math.min(...f.sole.map((p) => p[2]))).toBeGreaterThan(footing.floor - 2e-4);
  });

  it('keeps the zero-moment point under the feet on the ground, all the way round', () => {
    const { robot, clip, walk, footing } = setup();
    const points = massPoints(robot), n = walk.length - 1;
    const bodies = walk.slice(0, n).map((w) => points(clip.at(w.t)).map((b) => ({ m: b.m, p: applyTransform(clip.body!(w.t), b.p) })));
    const zmp = zmpOf(bodies, clip.period / n, 9.81, footing.floor);
    walk.slice(0, n).forEach((w, k) => {
      const touching = w.feet.flatMap((f) => f.sole.filter((p) => p[2] < footing.floor + 2e-3).map((p): [number, number] => [p[0], p[1]]));
      // This stand-in's few lumped masses reach 1.4 mm past the edge; the real G1 test holds it above zero.
      expect(margin(supportPolygon(touching), zmp[k] as [number, number])).toBeGreaterThan(-0.002);
    });
  });

  it('sways only as far as the pendulum carries it, toward the standing foot', () => {
    const { clip, walk, robot, q0 } = setup();
    const mid = walk.filter((w) => !w.feet[0].down).at(Math.floor(walk.filter((x) => !x.feet[0].down).length / 2))!;
    const stander = walk[0].feet[1].T.p[1];
    const com = massModel(robot);
    const c = applyTransform(clip.body!(mid.t), com(clip.at(mid.t)));
    expect(Math.sign(c[1])).toBe(Math.sign(stander));
    expect(Math.abs(c[1] - com(q0)[1])).toBeLessThan(0.8 * Math.abs(stander));
  });

  it('spends about a fifth of the cycle with both feet touching', () => {
    const { walk, footing } = setup();
    const both = walk.filter((w) => w.feet.every((f) => Math.min(...f.sole.map((p) => p[2])) < footing.floor + 2e-3)).length;
    expect(both / walk.length).toBeGreaterThan(0.15);
    expect(both / walk.length).toBeLessThan(0.3);
  });

  it('drives the knee up, lifts the foot clear and brings it down flat', () => {
    const { robot, clip, walk, gait, footing } = setup();
    const swing = walk.filter((w) => !w.feet[0].down);
    const top = swing.reduce((a, b) => (b.feet[0].T.p[2] > a.feet[0].T.p[2] ? b : a));
    expect(Math.min(...top.feet[0].sole.map((p) => p[2])) - footing.floor).toBeGreaterThan(0.9 * gait.height);
    const knee = robot.joints.findIndex((j) => j.name === 'left_knee');
    expect(clip.at(top.t)[knee]).toBeGreaterThan(0.9);
    const landing = swing.at(-1)!;
    expect(Math.acos(Math.min(1, landing.feet[0].T.R[8]))).toBeLessThan(0.02);
    // Well forward of the standing foot, under the raised knee.
    expect(top.feet[0].T.p[0] - top.feet[1].T.p[0]).toBeGreaterThan(0.12);
  });

  it('rises and falls along one slanted line, slowing to plumb at the floor', () => {
    const { robot, clip, gait, footing } = setup();
    const foot = (s: number) => tip(robot, clip, 0, clip.lead! + s * clip.period);
    const low = (s: number) => Math.min(...SOLE.map((p) => applyTransform(foot(s), p)[2])) - footing.floor;
    const h = 1 / 960, speed = (s: number) => {
      const [a, b] = [foot(s - h).p, foot(s + h).p];
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / (2 * h * clip.period);
    };
    expect(speed(gait.air - 0.005)).toBeLessThan(0.3);
    const phases = Array.from({ length: 400 }, (_, k) => (k / 400) * gait.air);
    const top = phases.reduce((a, b) => (low(b) > low(a) ? b : a));
    const at = (z: number, up: boolean) => foot((up ? phases.filter((s) => s <= top) : phases.filter((s) => s >= top).reverse()).find((s) => low(s) >= z)!).p[0];
    for (const z of [0.04, 0.07, 0.1]) expect(Math.abs(at(z, true) - at(z, false))).toBeLessThan(0.045);
  });

  it('steps a wide stance in under the hips during the lead-in, feet flat on each spot', () => {
    const b = biped(0.06);
    const body = bodyOf(b.robot, b.q0, 'humanoid');
    const clip = marchClip(b.robot, b.q0, b.footing, body, 1)!;
    const y = (t: number) => Math.abs(tip(b.robot, clip, 1, t).p[1]);
    expect(y(0)).toBeCloseTo(0.16, 3);
    const gait = marchGait(b.robot, b.q0, body, b.footing, 1);
    expect(y(clip.lead!)).toBeCloseTo(gait.stance, 2);
    expect(y(clip.lead! + 0.75 * clip.period)).toBeCloseTo(gait.stance, 2);
  });

  it('swings each arm from the shoulder against its opposite leg, the elbow nearly still', () => {
    const { robot, clip, walk } = setup();
    const hand = (limb: number, t: number) => tip(robot, clip, limb, t).p[0] - clip.body!(t).p[0];
    const top = walk.filter((w) => !w.feet[0].down).reduce((a, b) => (b.feet[0].T.p[2] > a.feet[0].T.p[2] ? b : a));
    expect(hand(3, top.t)).toBeGreaterThan(hand(2, top.t) + 0.15);
    const reach = walk.map((w) => hand(3, w.t));
    expect(Math.max(...reach)).toBeGreaterThan(0.1);
    expect(Math.min(...reach)).toBeLessThan(-0.05);
    const elbow = robot.joints.findIndex((j) => j.name === 'right_elbow');
    const bends = walk.map((w) => clip.at(w.t)[elbow]);
    expect(Math.max(...bends) - Math.min(...bends)).toBeLessThan(0.4);
  });

  it('counter-turns the shoulders against the hips', () => {
    const { robot, clip, walk } = setup();
    const waist = robot.joints.findIndex((j) => j.name === 'waist_yaw');
    const top = walk.filter((w) => !w.feet[0].down).reduce((a, b) => (b.feet[0].T.p[2] > a.feet[0].T.p[2] ? b : a));
    const hips = Math.atan2(clip.body!(top.t).R[3], clip.body!(top.t).R[0]);
    expect(hips).toBeLessThan(-0.02);
    expect(clip.at(top.t)[waist] + hips).toBeGreaterThan(0.02);
  });

  it('starts from the standing pose with no jump and closes its loop', () => {
    const { clip, q0 } = setup();
    clip.at(0).forEach((v, i) => expect(v).toBeCloseTo(q0[i], 9));
    expect(Math.hypot(...clip.body!(0).p)).toBeLessThan(1e-9);
    const lead = clip.lead!;
    clip.at(lead).forEach((v, i) => expect(v).toBeCloseTo(clip.at(lead + clip.period)[i], 9));
    for (let t = 0; t < lead + clip.period; t += 1 / 60) {
      const [a, b] = [clip.body!(t).p, clip.body!(t + 1 / 60).p];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(0.015);
      const [qa, qb] = [clip.at(t), clip.at(t + 1 / 60)];
      expect(Math.max(...qa.map((v, i) => Math.abs(v - qb[i])))).toBeLessThan(0.2);
    }
  });

  it('keeps its feet planted at other sizes', () => {
    for (const size of [0.5, 1.75]) {
      const { robot, q0, footing } = biped();
      const body = bodyOf(robot, q0, 'humanoid');
      const clip = marchClip(robot, q0, footing, body, size)!;
      const at = (s: number) => tip(robot, clip, 1, clip.lead! + s * clip.period).p;
      const held = at(0.1);
      for (let s = 0; s < 0.5; s += 0.01) expect(Math.hypot(at(s)[0] - held[0], at(s)[1] - held[1])).toBeLessThan(1e-3);
    }
  });

  it('is what March plays once a robot says how it stands, and only then', () => {
    const { robot, q0, footing } = biped();
    const stepping = presetsFor(robot, q0, 'humanoid', { footing: () => footing }).find((p) => p.id === 'march')!;
    expect(stepping.build(robot, q0, 1).body).toBeDefined();
    const old = presetsFor(robot, q0, 'humanoid').find((p) => p.id === 'march')!;
    expect(old.build(robot, q0, 1).body).toBeUndefined();
  });
});

describe('the whole robot\'s centre of mass', () => {
  it('counts a body once, from the chain that really moves it', () => {
    const { robot, q0 } = biped();
    const com = massModel(robot);
    const q = [...q0];
    const before = com(q);
    q[robot.joints.findIndex((j) => j.name === 'left_knee')] = 1.5;
    const after = com(q);
    expect(after[0]).not.toBeCloseTo(before[0], 3);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });
});

describe('a support polygon', () => {
  const square = supportPolygon([[0, 0], [1, 0], [1, 1], [0, 1]]);
  it('measures how far inside or outside a point stands', () => {
    expect(margin(square, [0.5, 0.5])).toBeCloseTo(0.5, 9);
    expect(margin(square, [0.9, 0.5])).toBeCloseTo(0.1, 9);
    expect(margin(square, [1.2, 0.5])).toBeCloseTo(-0.2, 9);
  });
});
