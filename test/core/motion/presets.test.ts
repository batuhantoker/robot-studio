import { describe, expect, it } from 'vitest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { limbQ, mergeLimbs } from '@/core/chain/limbs/types';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { presetsFor } from '@/core/motion/presets';
import { limbRoles } from '@/core/motion/roles';
import type { MotionRobot } from '@/core/motion/types';
import { parseRobot } from '@/core/robot/schema/parse';
import { presetSpec } from '../../support/fixtures';

const leg = (x: number, y: number) => chainFromSpec(parseRobot({
  units: 'SI', base: [x, y, 0.5],
  links: [
    { name: 'hip', axis: [1, 0, 0], offset: [0, 0, 0], mass: 0.5, limits: [-1, 1] },
    { name: 'thigh', axis: [0, 1, 0], offset: [0, 0, -0.22], mass: 0.5, limits: [-1.5, 1.5] },
    { name: 'knee', axis: [0, 1, 0], offset: [0, 0, -0.22], mass: 0.3, limits: [-2.6, -0.1] },
  ],
}));

function quadruped(): { robot: MotionRobot; q0: number[] } {
  const corners = [[0.3, 0.15], [0.3, -0.15], [-0.3, 0.15], [-0.3, -0.15]];
  const { joints, limbs } = mergeLimbs(corners.map(([x, y], i) => ({ name: `leg${i}`, chain: leg(x, y), keys: ['hip', 'thigh', 'knee'].map((k) => `${i}.${k}`) })));
  const q0 = joints.map((j) => (j.name === 'thigh' ? 0.5 : j.name === 'knee' ? -1 : 0));
  return { robot: { joints, limbs }, q0 };
}

const tip = (robot: MotionRobot, q: number[], limb: number) => chainFrames(robot.limbs[limb].chain, limbQ(robot.limbs[limb], q)).tip.p;

describe('motion presets', () => {
  it('offers gaits to a quadruped and trots diagonal pairs together', () => {
    const { robot, q0 } = quadruped();
    expect(limbRoles(robot, q0).every((r) => r.role === 'leg')).toBe(true);
    const ids = presetsFor(robot, q0, 'legged').map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['trot', 'walk', 'bob', 'wave-joints']));
    const clip = presetsFor(robot, q0, 'legged').find((p) => p.id === 'trot')!.build(robot, q0, 1);
    const ground = tip(robot, q0, 0)[2];
    const lift = (t: number, limb: number) => tip(robot, clip.at(t), limb)[2] - ground;
    const t = clip.period * 0.25;
    // Front-left and hind-right swing while the other diagonal stands.
    expect(lift(t, 0)).toBeGreaterThan(0.02);
    expect(lift(t, 3)).toBeGreaterThan(0.02);
    expect(Math.abs(lift(t, 1))).toBeLessThan(0.005);
    expect(Math.abs(lift(t, 2))).toBeLessThan(0.005);
    clip.at(0).forEach((v, i) => expect(v).toBeCloseTo(clip.at(clip.period)[i], 9));
  });

  it('makes an arm trace a circle with its tool', () => {
    const chain = chainFromSpec(presetSpec('spatial_6link'));
    const { joints, limbs } = mergeLimbs([{ name: 'arm', chain, keys: chain.joints.map((j) => j.name) }]);
    const robot = { joints, limbs };
    const q0 = [0.3, -0.6, 1.2, 0, -0.5, 0];
    const clip = presetsFor(robot, q0, 'arm').find((p) => p.id === 'circle')!.build(robot, q0, 1);
    const pts = Array.from({ length: 24 }, (_, k) => tip(robot, clip.at((k / 24) * clip.period), 0));
    const c = [0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i], 0) / pts.length);
    const radii = pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.01);
    expect(radii[0]).toBeGreaterThan(0.05);
  });

  it('keeps the joint wave inside every limit', () => {
    const { robot, q0 } = quadruped();
    const clip = presetsFor(robot, q0, 'legged').find((p) => p.id === 'wave-joints')!.build(robot, q0, 1.5);
    for (let k = 0; k < 50; k++) clip.at((k / 50) * clip.period).forEach((v, i) => {
      expect(v).toBeGreaterThanOrEqual(robot.joints[i].limits[0] - 1e-12);
      expect(v).toBeLessThanOrEqual(robot.joints[i].limits[1] + 1e-12);
    });
  });
});

describe('ready stance', () => {
  it('bends straight legs so a squat actually folds them instead of locking the knees', () => {
    const { robot, q0 } = quadruped();
    const straight = q0.map((v, i) => (robot.joints[i].name === 'knee' ? -0.1 : robot.joints[i].name === 'thigh' ? 0 : v));
    const bob = presetsFor(robot, straight, 'legged').find((p) => p.id === 'bob')!.build(robot, straight, 1);
    const z = (t: number) => tip(robot, bob.at(t), 0)[2];
    expect(z(bob.period / 2) - z(0)).toBeGreaterThan(0.05);
    const knees = robot.joints.map((j, i) => (j.name === 'knee' ? i : -1)).filter((i) => i >= 0);
    for (const k of knees) expect(bob.at(bob.period / 2)[k]).toBeLessThan(-0.3);
  });
});
