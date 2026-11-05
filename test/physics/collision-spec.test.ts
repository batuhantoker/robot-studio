import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clearWaypoints } from '@/app/collision/waypoints';
import { stateAt } from '@/app/controller/modes/trajectory';
import { contactTol, moduleLabel } from '@/app/robots/contact';
import { singleLimb } from '@/app/robots/single-limb';
import { hullOf } from '@/cad/common/hull';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { guardMove, probeSteps } from '@/core/collision/move';
import { rng, uniform } from '@/core/math/random/rng';
import { defaultWaypoints } from '@/core/trajectory/quintic/sample';
import { hullMjcf } from '@/core/mjcf/writer/hull';
import { homePose, reachEstimate } from '@/core/robot/config/pose';
import type { RobotSpec } from '@/core/robot/schema/types';
import { hullChecker } from '@/physics/collision/from-hull';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ } from '@/physics/runtime/arrays';
import { presetNames, presetSpec } from '../support/fixtures';
import { allJointsRobot, withEffector } from '../support/robots';
import { EFFECTOR_LIST } from '@/core/robot/effectors/kinds';

async function setup(spec: RobotSpec) {
  const assembly = buildSpecAssembly(spec);
  const chain = chainFromSpec(spec);
  const checker = await hullChecker(chain, assembly.hull!, {
    home: homePose(spec), floorZ: assembly.floorZ, tol: contactTol(reachEstimate(spec)), label: moduleLabel(assembly),
  });
  const steps = probeSteps(chain.joints.map((j) => j.type));
  return { assembly, chain, checker: checker!, steps };
}

const robots: [string, () => RobotSpec][] = [
  ...presetNames.map((n) => [n, () => presetSpec(n)] as [string, () => RobotSpec]),
  ['all joint kinds', allJointsRobot],
  ...EFFECTOR_LIST.map((e) => [`spatial_3link + ${e.label}`, () => withEffector(e.kind)] as [string, () => RobotSpec]),
];

describe('hull model mirrors the procedural CAD', () => {
  for (const [name, make] of robots) {
    it(`${name}: every hull volume sits where its marker is drawn`, async () => {
      const spec = make();
      const { assembly, chain, checker } = await setup(spec);
      checker.dispose();
      const markers: THREE.Object3D[] = [];
      assembly.root.traverse((o) => void (hullOf(o) && markers.push(o)));
      expect(markers.length).toBe(assembly.hull!.length);
      const h = await ModelHandle.fromXml(hullMjcf(chain, assembly.hull!));
      const geom = markers.map((_, i) => h.id(OBJ.geom, `h${i}`));
      const d = h.data as unknown as { qpos: Float64Array; geom_xpos: Float64Array; geom_xmat: Float64Array };
      const next = rng(5);
      for (let s = 0; s < 4; s++) {
        const q = chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
        d.qpos.set(q);
        h.mj.mj_kinematics(h.model, h.data);
        assembly.update([chainFrames(chain, q)], 0);
        assembly.root.updateMatrixWorld(true);
        markers.forEach((o, k) => {
          const i = geom[k];
          const p = o.getWorldPosition(new THREE.Vector3());
          const z = new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld);
          expect(p.distanceTo(new THREE.Vector3(...d.geom_xpos.slice(3 * i, 3 * i + 3)))).toBeLessThan(1e-9);
          expect(z.distanceTo(new THREE.Vector3(d.geom_xmat[9 * i + 2], d.geom_xmat[9 * i + 5], d.geom_xmat[9 * i + 8]))).toBeLessThan(1e-9);
        });
      }
      h.dispose();
    });

    it(`${name}: home is clear, and guarded moves end clear`, async () => {
      const { chain, checker, steps } = await setup(make());
      const home = homePose(make());
      expect(checker.hit(home)).toBeNull();
      const next = rng(11);
      for (let s = 0; s < 6; s++) {
        const to = chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
        expect(checker.hit(guardMove((q) => checker.hit(q), home, to, steps).q)).toBeNull();
      }
      checker.dispose();
    });
  }
});

describe('the arm stops where the real one would', () => {
  const stopOn = async (to: number[], from = [0, 0, 0]) => {
    const { checker, steps } = await setup(presetSpec('spatial_3link'));
    const g = guardMove((q) => checker.hit(q), from, to, steps);
    checker.dispose();
    return { q: g.q, pair: g.contact && [g.contact.a, g.contact.b].sort() };
  };

  it('folding the elbow up stops on the upper arm (a parent-child pair) before the joint limit', async () => {
    const g = await stopOn([0, 0, -2.4]);
    expect(g.pair).toEqual(['elbow link', 'shoulder link']);
    expect(g.q[2]).toBeLessThan(-1.5);
    expect(g.q[2]).toBeGreaterThan(-2.35);
  });

  it('folding the elbow down stops with the gripper on the floor', async () => {
    const g = await stopOn([0, 0, 2.4]);
    expect(g.pair).toEqual(['Parallel gripper', 'floor']);
    expect(g.q[2]).toBeGreaterThan(0.3);
    expect(g.q[2]).toBeLessThan(1);
  });

  it('pitching the shoulder down stops on the column it sits on', async () => {
    // Elbow raised: a straight arm's tip meets the floor at 0.30, just before the shoulder meets the column.
    const g = await stopOn([0, Math.PI / 2, -1.2], [0, 0, -1.2]);
    expect(g.pair).toEqual(['base_yaw link', 'shoulder link']);
    expect(g.q[1]).toBeGreaterThan(0.05);
    expect(g.q[1]).toBeLessThan(0.5);
  });

  it('a pose that already touches can still be moved out', async () => {
    const { checker, steps } = await setup(presetSpec('spatial_3link'));
    expect(checker.hit([0, 0, -2.4])).not.toBeNull();
    expect(guardMove((q) => checker.hit(q), [0, 0, -2.4], [0, 0, 0], steps)).toEqual({ q: [0, 0, 0], contact: null });
    checker.dispose();
  });
});

describe('the default trajectory plays through', () => {
  for (const [name, make] of robots) {
    it(`${name}: fitted waypoints stay clear and keep every joint moving that can`, async () => {
      const { chain, checker } = await setup(make());
      const { joints } = singleLimb(chain);
      const limits = joints.map((j) => j.limits);
      const raw = defaultWaypoints(limits);
      const w = clearWaypoints({ collision: checker, joints }, raw, 6);
      for (let i = 0; i <= 600; i++) expect(checker.hit(stateAt(limits, w, 6, (6 * i) / 600).q)).toBeNull();
      expect(w[0]).toEqual(raw[0]);
      const swing = (ws: number[][]) => Math.max(...ws.flatMap((q) => q.map((v, j) => Math.abs(v - ws[0][j]))));
      expect(swing(w)).toBeGreaterThan(0.25 * swing(raw));
      checker.dispose();
    });
  }
});
