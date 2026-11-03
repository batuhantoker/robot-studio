import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { moduleOf } from '@/cad/assembly/types';
import { partOf } from '@/cad/common/part';
import { chainFrames, forwardKinematics } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import type { Vec3 } from '@/core/math/linear/vec';
import { EFFECTOR_LIST } from '@/core/robot/effectors/kinds';
import { toPythonDict, toStudioDict } from '@/core/robot/io/export';
import { homePose } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import type { EffectorKind } from '@/core/robot/schema/types';
import { presetSpec } from '../support/fixtures';

export const withEffector = (effector: EffectorKind, tool: Vec3 = [0.12, 0, 0]) =>
  parseRobot({ ...toStudioDict(presetSpec('spatial_3link')), effector, tool });

function posed(effector: EffectorKind) {
  const spec = withEffector(effector);
  const chain = chainFromSpec(spec);
  const a = buildSpecAssembly(spec);
  a.update([chainFrames(chain, homePose(spec))], 0);
  a.root.updateMatrixWorld(true);
  return { a, tip: forwardKinematics(chain, homePose(spec)).p };
}

const toolBox = (root: THREE.Object3D, keep: (label: string) => boolean) => {
  const box = new THREE.Box3();
  root.traverse((o) => {
    const meta = partOf(o);
    if ((o as THREE.Mesh).isMesh && moduleOf(o) === 'tool' && meta && meta.layer !== 'cable' && keep(meta.label)) box.expandByObject(o);
  });
  return box;
};

describe('end effectors', () => {
  for (const e of EFFECTOR_LIST) {
    it(`${e.label}: the working end sits on the tool point`, () => {
      const { a, tip } = posed(e.kind);
      // spatial_3link at home points its tool along +x.
      expect(Math.abs(toolBox(a.root, (l) => !l.startsWith('Payload')).max.x - tip[0])).toBeLessThan(0.15 * a.effector!.size);
      expect(a.modules.find((m) => m.id === 'tool')?.label).toBe(e.label);
      a.dispose();
    });
  }

  it('grippers close their pads to the commanded opening; tools do not grip', () => {
    for (const e of EFFECTOR_LIST) {
      const { a } = posed(e.kind);
      const rig = a.effector!;
      expect(rig.grip !== null).toBe(['parallel', 'three_finger', 'suction'].includes(e.kind));
      if (e.kind === 'parallel') {
        for (const gap of [rig.grip!.min, rig.grip!.rest, rig.grip!.max]) {
          rig.grip!.set(gap);
          a.root.updateMatrixWorld(true);
          // Jaws close across world y here (the tool points along +x); pads' inner faces bound the gap.
          const pads: THREE.Box3[] = [];
          a.root.traverse((o) => partOf(o)?.label === 'Finger pad' && pads.push(new THREE.Box3().setFromObject(o)));
          const inner = Math.min(...pads.map((b) => b.max.z)) - Math.max(...pads.map((b) => b.min.z));
          const across = Math.min(...pads.map((b) => b.max.y)) - Math.max(...pads.map((b) => b.min.y));
          expect(Math.abs(Math.max(-inner, -across) - gap)).toBeLessThan(0.02 * rig.size);
        }
      }
      if (e.kind === 'three_finger') {
        const spread = (gap: number) => {
          rig.grip!.set(gap);
          a.root.updateMatrixWorld(true);
          return toolBox(a.root, (l) => l === 'Finger pad').getSize(new THREE.Vector3()).y;
        };
        expect(spread(rig.grip!.min)).toBeLessThan(spread(rig.grip!.max));
      }
      a.dispose();
    }
  });

  it('round-trips through studio JSON and stays out of Python JSON', () => {
    const spec = withEffector('suction');
    expect(parseRobot(toStudioDict(spec)).effector).toBe('suction');
    expect('effector' in toPythonDict(spec)).toBe(false);
    expect('effector' in toStudioDict(withEffector('parallel'))).toBe(false);
    expect(() => withEffector('laser' as EffectorKind)).toThrow(/effector/);
  });
});
