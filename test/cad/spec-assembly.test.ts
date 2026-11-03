import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { chainFrames } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { rng, uniform } from '@/core/math/random/rng';
import { allJointsRobot } from '../support/robots';
import { presetSpec } from '../support/fixtures';

describe('procedural assembly follows the chain frames', () => {
  for (const [name, spec] of [['all joint kinds', allJointsRobot()], ['spatial_6link', presetSpec('spatial_6link')]] as const) {
    it(name, () => {
      const assembly = buildSpecAssembly(spec);
      const chain = chainFromSpec(spec);
      const next = rng(9);
      const q = chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
      const f = chainFrames(chain, q);
      assembly.update([f], 0);
      assembly.root.updateMatrixWorld(true);
      const stages = assembly.root.children.filter((c) => typeof c.userData.module === 'string' && c.userData.module.startsWith('joint:'));
      expect(stages.length).toBe(chain.joints.length + spec.links.length);
      const origins = stages.map((s) => s.getWorldPosition(new THREE.Vector3()));
      // The last stage of each link sits on that link's final DOF frame.
      let k = 0;
      let i = 0;
      for (const link of spec.links) {
        i += link.dofs.length + 1;
        k += link.dofs.length;
        const expected = new THREE.Vector3(...f.frames[k - 1].p);
        expect(origins[i - 1].distanceTo(expected)).toBeLessThan(1e-12);
      }
      assembly.dispose();
    });
  }
});
