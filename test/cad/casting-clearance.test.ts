import fs from 'node:fs';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contactTol, moduleLabel } from '@/app/robots/contact';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { lowestSolidZ } from '@/cad/common/lowest';
import { surfaceOf } from '@/cad/parts/castings/crisp';
import { planChain } from '@/cad/parts/castings/plan';
import { bodyEnds, castBody } from '@/cad/parts/castings/recipe';
import { chainFrames, zeroPose } from '@/core/chain/kinematics/frames';
import { rng, uniform } from '@/core/math/random/rng';
import { toMjcf } from '@/core/mjcf/writer/serial-arm';
import { homePose, reachEstimate } from '@/core/robot/config/pose';
import { toStudioDict } from '@/core/robot/io/export';
import { parseRobot } from '@/core/robot/schema/parse';
import type { RobotSpec } from '@/core/robot/schema/types';
import { hullChecker } from '@/physics/collision/from-hull';
import { blankRobot, patchLink, rawOf } from '@/ui/builder/edit';
import { contactProbe, crackedCastings, drawn, featureClashes, rigidBodies, sameBodyOverlaps, spheresOf } from '../support/casting-gate';

const read = (path: string) => JSON.parse(fs.readFileSync(new URL(`../../presets/${path}.json`, import.meta.url), 'utf8'));
const iiwa = () => parseRobot(read('studio/iiwa14'));

describe('KUKA LBR iiwa 14 R820 castings', () => {
  const spec = iiwa();
  let probe: Awaited<ReturnType<typeof contactProbe>>;
  beforeAll(async () => { probe = await contactProbe(spec); }, 60000);
  afterAll(() => probe.dispose());


  it('touches nothing at home or at zero, with no tolerance', () => {
    expect([...probe.at(homePose(spec))]).toEqual([]);
    expect([...probe.at(zeroPose(probe.chain))]).toEqual([]);
  });

  it('leaves the checker no pair to treat as designed', async () => {
    const checker = (await hullChecker(probe.chain, probe.asm.hull!, { home: homePose(spec), floorZ: probe.asm.floorZ, tol: contactTol(reachEstimate(spec)), label: moduleLabel(probe.asm) }))!;
    expect((checker as unknown as { designed: Set<number> }).designed.size).toBe(0);
    checker.dispose();
  });

  it('every roll joint reaches its limits and every hinge gets at least 90% of the way there', () => {
    const home = homePose(spec);
    const tol = contactTol(reachEstimate(spec));
    probe.chain.joints.forEach((j, k) => {
      for (const end of j.limits) {
        const dir = Math.sign(end);
        let reached = end;
        for (let a = home[k]; dir > 0 ? a <= end : a >= end; a += dir * 0.02) {
          const q = [...home];
          q[k] = a;
          if ([...probe.at(q).values()].some((d) => d < -tol)) { reached = a; break; }
        }
        expect(reached / end, `${j.name} towards ${end}`).toBeGreaterThanOrEqual(k % 2 ? 0.9 : 1);
      }
    });
  });

  // A clearance test alone rewards deleting material; these extents are measured from the real link meshes at zero.
  it('keeps the size of the real links', () => {
    const extents: Record<string, number[]> = {
      base: [-0.136, 0.121, -0.121, 0.121, 0, 0.1575],
      'link:a1': [-0.085, 0.085, -0.116, 0.085, 0.1575, 0.445],
      'link:a2': [-0.086, 0.086, -0.068, 0.132, 0.275, 0.5645],
      'link:a3': [-0.068, 0.068, -0.068, 0.115, 0.5645, 0.848],
      'link:a4': [-0.068, 0.068, -0.115, 0.068, 0.712, 0.9645],
      'link:a5': [-0.068, 0.068, -0.099, 0.068, 0.9645, 1.232],
      'link:a6': [-0.066, 0.066, -0.061, 0.067, 1.094, 1.261],
      'link:a7': [-0.052, 0.052, -0.052, 0.052, 1.261, 1.306],
    };
    const bodies = drawn(probe.asm, spec);
    for (const [id, want] of Object.entries(extents)) {
      const box = new THREE.Box3().setFromPoints(bodies.get(id)!);
      const got = [box.min.x, box.max.x, box.min.y, box.max.y, box.min.z, box.max.z];
      got.forEach((v, i) => expect(Math.abs(v - want[i]), `${id} extent ${i}`).toBeLessThan(0.016));
    }
  });

  it('has a hull that follows what is drawn', () => {
    const bodies = drawn(probe.asm, spec);
    const hull = spheresOf(probe.asm);
    for (const [id, verts] of bodies) {
      const balls = hull.get(id)!;
      expect(balls?.length, id).toBeGreaterThan(8);
      const outside = verts.filter((_, i) => i % 7 === 0).map((v) => Math.min(...balls.map((b) => v.distanceTo(b.at) - b.r))).sort((a, b) => a - b);
      expect(outside[Math.floor(outside.length * 0.95)], `${id} p95`).toBeLessThan(0.011);
    }
  });

  it('misses no deep penetration of the drawn castings at random poses', () => {
    const plan = planChain(spec);
    const bodies = [-1, ...spec.links.keys()].map((k) => {
      const design = k < 0 ? spec.design?.base : spec.design?.links?.[spec.links[k].name];
      const origin = k < 0 ? spec.base : plan.joints[k].origin;
      const c = castBody(bodyEnds(plan, k), origin, design, plan.gap)!;
      return { k, origin, solid: c.solid.f, points: surfaceOf(c.solid, c.lo, c.hi, c.cell * 2, c.blend).position };
    });
    const tol = contactTol(reachEstimate(spec));
    const place = (f: ReturnType<typeof chainFrames>, k: number) => (k < 0 ? { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [0, 0, 0] } : f.frames[k]);
    const depth = (q: number[]) => {
      const f = chainFrames(probe.chain, q);
      let worst = 0;
      for (const a of bodies) for (const b of bodies) {
        if (a === b) continue;
        const [A, B] = [place(f, a.k), place(f, b.k)];
        for (let i = 0; i < a.points.length; i += 3 * 9) {
          const x = a.points[i] - a.origin[0], y = a.points[i + 1] - a.origin[1], z = a.points[i + 2] - a.origin[2];
          const wx = A.R[0] * x + A.R[1] * y + A.R[2] * z + A.p[0] - B.p[0], wy = A.R[3] * x + A.R[4] * y + A.R[5] * z + A.p[1] - B.p[1], wz = A.R[6] * x + A.R[7] * y + A.R[8] * z + A.p[2] - B.p[2];
          worst = Math.min(worst, b.solid(B.R[0] * wx + B.R[3] * wy + B.R[6] * wz + b.origin[0], B.R[1] * wx + B.R[4] * wy + B.R[7] * wz + b.origin[1], B.R[2] * wx + B.R[5] * wy + B.R[8] * wz + b.origin[2]));
        }
      }
      return worst;
    };
    const next = rng(21);
    let hits = 0;
    for (let s = 0; s < 120; s++) {
      const q = probe.chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
      const touching = [...probe.at(q)].some(([pair, d]) => !pair.includes('tool') && d < -tol);
      const d = depth(q);
      if (d < -tol) hits++;
      if (!touching) expect(d, `pose ${s}`).toBeGreaterThan(-0.008);
    }
    expect(hits).toBeGreaterThan(5);
  });

  it('keeps every drawn part out of the castings of its own body', () => {
    expect(sameBodyOverlaps(probe.asm, spec)).toEqual([]);
    expect([...rigidBodies(probe.asm, spec).keys()].length).toBe(8);
  });

  it('leaves no crack where the faces of a casting meet', () => {
    expect(crackedCastings(probe.asm)).toEqual([]);
  });

  // Within one casting there is one solid, so neither check above can see a pocket slicing through the pod beside it.
  it('keeps the features of a casting from cutting one another', () => {
    expect(featureClashes(spec)).toEqual([]);
    const shapes = spec.design!.base!.shapes!;
    const pod = shapes.find((s) => s.feature === 'rear pod')!;
    const stray = { cut: true, feature: 'stray pocket', drum: [[-0.1, 0.07, 0.03], [-0.1, 0.07, 0.09]], r: 0.02 };
    const broken = { ...spec, design: { ...spec.design, base: { ...spec.design!.base, shapes: [...shapes, stray] } } } as RobotSpec;
    expect(featureClashes(broken).join()).toContain(`stray pocket / ${pod.feature}`);
  });

  it('stands on the floor at z = 0 and carries the tool on the true flange', () => {
    expect(probe.asm.floorZ).toBe(0);
    expect(probe.asm.effector!.group.position.toArray()).toEqual([0, 0, 0.126]);
    probe.asm.update([chainFrames(probe.chain, homePose(spec))], 0);
    expect(lowestSolidZ(probe.asm.root)).toBeCloseTo(0, 6);
  });

  it('gives every joint its own load ring, dark until loaded', () => {
    const rings = probe.asm.indicators.map((m) => m!.material as THREE.MeshPhysicalMaterial);
    expect(new Set(rings).size).toBe(7);
    for (const r of rings) expect(r.color.getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(0.1);
  });

  it('opens along the joints when exploded', () => {
    const f = chainFrames(probe.chain, zeroPose(probe.chain));
    const at = (e: number) => {
      probe.asm.update([f], e);
      probe.asm.root.updateMatrixWorld(true);
      return probe.asm.effector!.group.getWorldPosition(new THREE.Vector3());
    };
    expect(at(1).z - at(0).z).toBeGreaterThan(0.2);
  });

  it('keeps its design through a Builder edit, and the design changes nothing the physics sees', () => {
    const edited = parseRobot(patchLink(rawOf(spec), 2, { mass: 3.2 }));
    expect(edited.design).toEqual(spec.design);
    expect(toMjcf(parseRobot({ ...toStudioDict(spec), design: undefined }))).toBe(toMjcf(spec));
    const moved = parseRobot(patchLink(rawOf(spec), 4, { offset: [0, 0, 0.45] }));
    const a = buildSpecAssembly(moved);
    expect(a.hull!.length).toBeGreaterThan(100);
    a.dispose();
  });
});

describe('castings with no design data', () => {
  const robots: [string, () => RobotSpec][] = [
    ['the Builder\'s blank robot', () => parseRobot(blankRobot())],
    ['Universal Robots UR5e', () => parseRobot({ ...read('studio/ur5e'), design: {} })],
    ['ABB IRB 120', () => parseRobot({ ...read('studio/irb120'), design: {} })],
    ['the 4-DOF Arm\'s chain without its sidecar', () => parseRobot({ ...read('serial-arm/original_4dof'), design: {} })],
    ['iiwa kinematics without its data', () => { const { design: _, ...raw } = read('studio/iiwa14'); return parseRobot({ ...raw, design: {} }); }],
  ];
  for (const [name, make] of robots) {
    it(`${name}: touches nothing at zero, and every body has a hull`, async () => {
      const spec = make();
      const p = await contactProbe(spec);
      expect([...p.at(zeroPose(p.chain))]).toEqual([]);
      const hulled = new Set(p.asm.hull!.map((v) => v.module));
      for (const m of p.asm.modules) if (m.id === 'base' || m.id.startsWith('link:')) expect(hulled.has(m.id), m.id).toBe(true);
      // The floor is measured at home; other poses may legitimately dip below it.
      p.asm.update([chainFrames(p.chain, homePose(spec))], 0);
      expect(lowestSolidZ(p.asm.root)).toBeGreaterThanOrEqual(p.asm.floorZ - 1e-6);
      p.dispose();
    });
  }
});
