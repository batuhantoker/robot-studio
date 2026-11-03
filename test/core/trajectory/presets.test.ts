import { describe, expect, it } from 'vitest';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { mergeLimbs } from '@/core/chain/limbs/types';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { compile } from '@/core/trajectory/plan';
import { buildTrajectoryPreset, trajectoryPresetsFor } from '@/core/trajectory/presets/build';
import { presetNames, presetSpec } from '../../support/fixtures';

const robotOf = (name: string) => {
  const chain = chainFromSpec(presetSpec(name));
  const robot = mergeLimbs([{ name, chain, keys: chain.joints.map((j) => j.name) }]);
  const home = robot.joints.map((j) => Math.min(Math.max(0, j.limits[0]), j.limits[1]));
  return { robot, home };
};

describe('trajectory presets', () => {
  for (const name of presetNames) {
    it(`fit ${name}`, () => {
      const { robot, home } = robotOf(name);
      const dof = robot.joints.length;
      const list = trajectoryPresetsFor(robot, 0, home);
      expect(list.map((p) => p.id)).toContain('tour');
      for (const p of list) {
        const built = buildTrajectoryPreset(p.id, robot, 0, home);
        const drawing = ['square', 'star', 'spiral', 'eight', 'weave', 'raster'].includes(p.id);
        if (dof >= 3 || drawing || p.id === 'tour') expect(built, `${name} ${p.id}`).not.toBeNull();
        if (!built) continue;
        const { waypoints, opts, duration } = built.plan;
        expect(opts).toHaveLength(waypoints.length);
        expect(waypoints[0]).toEqual(home);
        expect(waypoints.at(-1)).toEqual(home);
        for (const q of waypoints) q.forEach((v, k) => {
          expect(v).toBeGreaterThanOrEqual(robot.joints[k].limits[0] - 1e-9);
          expect(v).toBeLessThanOrEqual(robot.joints[k].limits[1] + 1e-9);
        });
        expect(duration).toBeGreaterThan(2);
        const c = compile(built.plan);
        expect(c.arrive.at(-1)).toBeCloseTo(duration, 9);
      }
    });
  }

  it('draws a square with straight edges: the tool stays near the line between corners', () => {
    const { robot, home } = robotOf('spatial_6link');
    const built = buildTrajectoryPreset('square', robot, 0, home)!;
    const c = compile(built.plan);
    const tip = (q: number[]) => chainFrames(robot.limbs[0].chain, q).tip.p;
    const corners = built.plan.waypoints.map((q, i) => ({ q, i })).filter(({ i }) => i > 1 && i < built.plan.waypoints.length - 2 && !built.plan.opts[i].via);
    expect(corners.length).toBe(5);
    // Between two corners, sampled tool points stay within a few mm of the straight edge.
    for (let k = 0; k + 1 < corners.length; k++) {
      const a = tip(corners[k].q), b = tip(corners[k + 1].q);
      const ab = b.map((v, m) => v - a[m]), len = Math.hypot(...ab);
      for (let s = 1; s < 20; s++) {
        const t = c.leave[corners[k].i] + ((c.arrive[corners[k + 1].i] - c.leave[corners[k].i]) * s) / 20;
        const p = tip(c.at(t).q).map((v, m) => v - a[m]);
        const along = p.reduce((x, v, m) => x + (v * ab[m]) / len, 0);
        const off = Math.hypot(...p.map((v, m) => v - (along * ab[m]) / len));
        expect(off).toBeLessThan(0.004);
      }
    }
  });

  it('pauses to grip and release in pick & place', () => {
    const { robot, home } = robotOf('spatial_6link');
    const built = buildTrajectoryPreset('pick', robot, 0, home)!;
    const c = compile(built.plan);
    const held = built.plan.opts.map((o, i) => (o.hold ? i : -1)).filter((i) => i >= 0);
    expect(held).toHaveLength(2);
    for (const i of held) {
      expect(c.leave[i] - c.arrive[i]).toBeCloseTo(0.5, 9);
      expect(c.at((c.arrive[i] + c.leave[i]) / 2).holding).toBe(i);
    }
  });

  it('moves or shrinks a preset until it is clear, when given a contact test', () => {
    const { robot, home } = robotOf('spatial_6link');
    const free = buildTrajectoryPreset('spiral', robot, 0, home)!;
    // A ceiling just under the unconstrained spiral's highest point.
    const z = (q: number[]) => chainFrames(robot.limbs[0].chain, q).tip.p[2];
    const top = Math.max(...free.plan.waypoints.map(z));
    const hit = (q: number[]) => z(q) > top - 0.02;
    const fitted = buildTrajectoryPreset('spiral', robot, 0, home, hit)!;
    expect(fitted.touching).toBe(false);
    expect(fitted.plan.waypoints).not.toEqual(free.plan.waypoints);
    const c = compile(fitted.plan);
    for (let k = 0; k <= 200; k++) expect(hit(c.at((fitted.plan.duration * k) / 200).q)).toBe(false);
  });
});
