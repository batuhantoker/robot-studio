import { describe, expect, it } from 'vitest';
import { contactTol, moduleLabel } from '@/app/robots/contact';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { contactText } from '@/core/collision/hull';
import { compose } from '@/core/math/linear/transform';
import type { Vec3 } from '@/core/math/linear/vec';
import { homePose, reachEstimate } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import { toStudioDict } from '@/core/robot/io/export';
import type { EffectorKind } from '@/core/robot/schema/types';
import { taskObject } from '@/core/task/objects';
import { isClip, planTask } from '@/core/task/plan/check';
import { toolPose, workingEnd } from '@/core/task/plan/poses';
import { reachRing } from '@/core/task/reach';
import { hullChecker } from '@/physics/collision/from-hull';
import { presetSpec } from '../../support/fixtures';

async function setup(effector: EffectorKind) {
  const spec = parseRobot({ ...toStudioDict(presetSpec('spatial_6link')), effector });
  const a = buildSpecAssembly(spec);
  const chain = chainFromSpec(spec);
  const rig = a.effector!;
  const checker = (await hullChecker(chain, a.hull!, { home: homePose(spec), floorZ: a.floorZ, tol: contactTol(reachEstimate(spec)), label: moduleLabel(a) }))!;
  const probe = (q: number[]) => { const h = checker.hit(q); return h && contactText(h); };
  const ctx = { chain, tool: rig.tool, length: 0.2, maxTilt: 0.35 };
  const object = taskObject(effector, rig.size, rig.grip!)!;
  const input = (pick: Vec3, place: Vec3) => ({ ctx, home: homePose(spec), pick, place, object, floorZ: a.floorZ, lift: rig.size * 1.5, base: spec.base });
  return { spec, a, checker, probe, ctx, object, input };
}

describe('pick and place planning', () => {
  for (const effector of ['parallel', 'three_finger', 'suction'] as EffectorKind[]) {
    it(`${effector}: grasps at A, carries, releases at B, and the loop closes`, async () => {
      const { a, checker, probe, ctx, object, input } = await setup(effector);
      const [pick, place]: Vec3[] = [[0.36, -0.2, a.floorZ], [0.36, 0.2, a.floorZ]];
      const clip = planTask(input(pick, place), probe);
      expect(isClip(clip)).toBe(true);
      if (!isClip(clip)) return;
      const ts = Array.from({ length: 2000 }, (_, i) => (clip.period * i) / 2000);
      const grasp = ts.find((t) => clip.object(t).held)!;
      const q = clip.at(grasp).q;
      const w = workingEnd(ctx, q);
      expect(Math.hypot(w[0] - pick[0], w[1] - pick[1])).toBeLessThan(2e-3);
      expect(w[2]).toBeCloseTo(a.floorZ + object.graspZ, 3);
      expect(clip.at(grasp).gap).toBeCloseTo(object.hold, 6);
      const carry = ts.filter((t) => clip.object(t).held);
      for (const t of carry) {
        const s = clip.object(t);
        if (!s.held) continue;
        const pose = compose(toolPose(ctx, clip.at(t).q), s.offset);
        expect(pose.p[2]).toBeGreaterThan(a.floorZ + object.size[2] / 2 - 2e-3);
      }
      const atB = ts.map((t) => clip.object(t)).find((s, i) => !s.held && i > ts.indexOf(grasp))!;
      if (atB.held) throw new Error('expected a resting state at B');
      expect(Math.hypot(atB.pose.p[0] - place[0], atB.pose.p[1] - place[1])).toBeLessThan(2e-3);
      expect(clip.object(clip.period - 1e-6)).toEqual(clip.object(0));
      checker.dispose();
    });
  }

  it('reports an out-of-reach pick instead of planning it', async () => {
    const { a, checker, probe, input } = await setup('parallel');
    const plan = planTask(input([3, 0, a.floorZ], [0.36, 0.2, a.floorZ]), probe);
    expect(isClip(plan) ? null : plan.where).toBe('pick');
    checker.dispose();
  });

  it('maps reachable floor spots: some rings reach, the far ring does not', async () => {
    const { spec, a, checker, probe, ctx, object } = await setup('parallel');
    const grid = { base: spec.base, radius: reachEstimate(spec), floorZ: a.floorZ, rings: 6, spokes: 12 };
    const rings = [1, 2, 5].map((r) => reachRing(ctx, homePose(spec), grid, object, object.size[2], r, probe));
    expect(rings[0].some((c) => c.ok) || rings[1].some((c) => c.ok)).toBe(true);
    expect(rings[2].every((c) => !c.ok)).toBe(true);
    checker.dispose();
  });
});
