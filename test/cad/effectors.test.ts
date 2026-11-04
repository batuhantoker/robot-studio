import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { moduleOf } from '@/cad/assembly/types';
import { partOf, settle } from '@/cad/common/part';
import { MaterialSet } from '@/cad/materials/library';
import { EFFECTOR_BUILDERS } from '@/cad/registry/effectors';
import { explodeParts } from '@/scene/teardown/explode';
import { chainFrames, forwardKinematics } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { EFFECTOR_LIST } from '@/core/robot/effectors/kinds';
import { toPythonDict, toStudioDict } from '@/core/robot/io/export';
import { withEffector } from '../support/robots';
import { homePose } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import type { EffectorKind } from '@/core/robot/schema/types';

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

/** Each part's box in the tool frame (approach = +y), cables aside. */
function partBoxes(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const out: { label: string; box: THREE.Box3 }[] = [];
  root.traverse((o) => {
    const meta = partOf(o);
    if (meta && (o as THREE.Mesh).isMesh && meta.layer !== 'cable') out.push({ label: meta.label, box: new THREE.Box3().setFromObject(o) });
  });
  return out;
}

/** Pairs stacked along the approach at rest whose order flips while exploding, where their footprints overlap. */
function passThroughs(kind: EffectorKind, along: number): string[] {
  const s = 0.04, eps = 0.02 * s;
  const rig = EFFECTOR_BUILDERS[kind]({ mats: new MaterialSet(), flange: new THREE.Vector3(), tip: new THREE.Vector3(0, along * s, 0), approach: new THREE.Vector3(0, 1, 0), size: s, payload: 0 });
  settle(rig.group);
  const rest = partBoxes(rig.group);
  const found = new Set<string>();
  for (const amount of [0.25, 0.5, 1, 1.6]) {
    explodeParts(rig.group, amount, null, () => 'tool');
    const now = partBoxes(rig.group);
    rest.forEach((above, i) => rest.forEach((below, j) => {
      if (i === j || above.box.max.y > below.box.min.y + eps) return;
      const [a, b] = [now[i].box, now[j].box];
      const overlap = a.max.x - eps > b.min.x && b.max.x - eps > a.min.x && a.max.z - eps > b.min.z && b.max.z - eps > a.min.z;
      if (overlap && a.max.y > b.min.y + eps) found.add(`${above.label} through ${below.label} at ${amount}`);
    }));
  }
  return [...found];
}

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

  it('explode opens every tool in stack order: no part passes through another', () => {
    for (const e of EFFECTOR_LIST) for (const along of [0, 7]) expect(passThroughs(e.kind, along), `${e.kind} at ${along}`).toEqual([]);
  });

  it('a fully exploded robot opens its tool past the wrist, not into it', () => {
    for (const name of ['ur5e', 'scara']) {
      const spec = parseRobot(JSON.parse(readFileSync(new URL(`../../presets/studio/${name}.json`, import.meta.url), 'utf8')));
      const a = buildSpecAssembly(spec);
      a.update([chainFrames(chainFromSpec(spec), homePose(spec))], 1);
      explodeParts(a.root, 1, null, moduleOf);
      a.root.updateMatrixWorld(true);
      const wrist = new Set([`joint:${spec.links.at(-1)!.name}`, `link:${spec.links.at(-1)!.name}`]);
      const [tool, other]: THREE.Box3[][] = [[], []];
      a.root.traverse((o) => {
        const meta = partOf(o);
        if (!meta || !(o as THREE.Mesh).isMesh || meta.layer === 'cable') return;
        const box = new THREE.Box3().setFromObject(o).expandByScalar(-0.0005);
        if (moduleOf(o) === 'tool') tool.push(box);
        else if (wrist.has(moduleOf(o)!)) other.push(box);
      });
      expect(tool.some((t) => other.some((w) => t.intersectsBox(w))), name).toBe(false);
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
