/** A robot with no design data is one being edited: it draws coarser and quicker, and must stay as safe as any other. */
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { contactTol, moduleLabel } from '@/app/robots/contact';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { guardMove, probeSteps } from '@/core/collision/move';
import { homePose, reachEstimate } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import { hullChecker } from '@/physics/collision/from-hull';
import { addLink, blankRobot } from '@/ui/builder/edit';
import { contactProbe } from '../support/casting-gate';

const specOf = (raw: Record<string, unknown>, design?: object) => parseRobot({ ...raw, ...(design ? { design } : {}) });

describe('a Builder robot draft', () => {
  it('has a far lighter mesh than the same robot with design data', () => {
    const triangles = (a: ReturnType<typeof buildSpecAssembly>) => {
      let n = 0;
      a.root.traverse((o) => void (o.userData.field && (n += (o as THREE.Mesh).geometry.index!.count / 3)));
      return n;
    };
    const [draft, full] = [specOf(blankRobot()), specOf(blankRobot(), {})].map(buildSpecAssembly);
    expect(triangles(draft)).toBeLessThan(triangles(full) * 0.4);
    draft.dispose();
    full.dispose();
  });

  // A draft changes the mesh, never the shape: one that rounded away real contact let an elbow fold through its upper arm.
  it('stops where the same robot with design data stops', async () => {
    const stops = async (design?: object) => {
      const spec = specOf(blankRobot(), design);
      const a = buildSpecAssembly(spec);
      const chain = chainFromSpec(spec);
      const checker = (await hullChecker(chain, a.hull!, { home: homePose(spec), floorZ: a.floorZ, tol: contactTol(reachEstimate(spec)), label: moduleLabel(a) }))!;
      const steps = probeSteps(chain.joints.map((j) => j.type));
      const zero = chain.joints.map(() => 0);
      const out = [[0, 0, -2.4], [0, Math.PI / 2, -1.2]].map((to, i) => {
        const g = guardMove((q) => checker.hit(q), i ? [0, 0, -1.2] : zero, to, steps);
        return { q: g.q, pair: g.contact && [g.contact.a, g.contact.b].sort() };
      });
      checker.dispose();
      a.dispose();
      return out;
    };
    const [draft, full] = [await stops(), await stops({})];
    draft.forEach((d, i) => {
      expect(d.pair).toEqual(full[i].pair);
      expect(d.pair).not.toBeNull();
      d.q.forEach((v, k) => expect(Math.abs(v - full[i].q[k])).toBeLessThan(0.2));
    });
  });

  for (const [name, raw] of [['blank', blankRobot()], ['with a revolute', addLink(blankRobot(), 'revolute')], ['with a planar joint', addLink(blankRobot(), 'planar')], ['with a spherical joint', addLink(blankRobot(), 'spherical')]] as const) {
    it(`${name}: touches nothing at home and gives every body a hull`, async () => {
      const spec = specOf(raw);
      const probe = await contactProbe(spec);
      expect([...probe.at(homePose(spec))]).toEqual([]);
      const hulled = new Set(probe.asm.hull!.map((v) => v.module));
      for (const m of probe.asm.modules) if (m.id === 'base' || m.id.startsWith('link:')) expect(hulled.has(m.id), m.id).toBe(true);
      probe.dispose();
    });
  }
});
