import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { planChain } from '@/cad/parts/castings/plan';
import { bodyEnds, castBody } from '@/cad/parts/castings/recipe';
import { chainFrames, zeroPose } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { parseRobot } from '@/core/robot/schema/parse';

const read = (id: string) => JSON.parse(fs.readFileSync(new URL(`../../presets/studio/${id}.json`, import.meta.url), 'utf8'));
const elbowOf = (raw: Record<string, unknown>) => planChain(parseRobot(raw)).joints[2];

describe('a joint design can overrule how the plan reads a link', () => {
  const bare = () => ({ ...read('puma560'), design: undefined });

  it('leaves a robot that does not set them as it was', () => {
    const plan = planChain(parseRobot(read('iiwa14')));
    expect(plan.joints.map((j) => j.kind)).toEqual(['roll', 'hinge', 'roll', 'hinge', 'roll', 'hinge', 'roll']);
    expect(plan.joints.map((j) => j.axis.map((v) => v + 0))).toEqual([[0, 0, 1], [0, 1, 0], [0, 0, 1], [0, -1, 0], [0, 0, 1], [0, 1, 0], [0, 0, 1]]);
    const elbow = elbowOf(bare());
    expect(elbow.kind).toBe('roll');
    expect(elbow.axis).toEqual([0, -1, 0]);
  });

  it('false reads the same as unset', () => {
    const iiwa = read('iiwa14');
    const set = { ...iiwa, design: { ...iiwa.design, joints: Object.fromEntries(Object.entries(iiwa.design.joints).map(([k, v]) => [k, { ...(v as object), hinge: false, flip: false }])) } };
    expect(planChain(parseRobot(set)).joints.map((j) => [j.kind, j.axis, j.plane])).toEqual(planChain(parseRobot(iiwa)).joints.map((j) => [j.kind, j.axis, j.plane]));
  });

  it('hinge keeps a sideways elbow offset from reading as a roll', () => {
    expect(elbowOf({ ...bare(), design: { joints: { elbow: { hinge: true } } } }).kind).toBe('hinge');
  });

  it('flip puts the child on the far side of the interface', () => {
    const plain = elbowOf({ ...bare(), design: { joints: { elbow: { hinge: true } } } });
    const flipped = elbowOf({ ...bare(), design: { joints: { elbow: { hinge: true, flip: true } } } });
    expect(flipped.axis.map((v) => v + 0)).toEqual(plain.axis.map((v) => -v + 0));
  });
});

describe('a forked knuckle', () => {
  const cast = (fork?: number) => {
    const raw = read('iiwa14');
    const a4 = raw.design.joints.a4;
    const spec = parseRobot({ ...raw, design: { ...raw.design, joints: { ...raw.design.joints, a4: { ...a4, parent: { ...a4.parent, ...(fork ? { fork } : {}) } } } } });
    const plan = planChain(spec);
    return { plan, f: castBody(bodyEnds(plan, 2), plan.joints[2].origin, spec.design!.links!.a3, plan.gap)!.solid.f };
  };

  it('leaves a robot that does not set it as it was', () => {
    const [{ f: a, plan }, { f: b }] = [cast(), cast()];
    expect(plan.joints[3].parent.fork).toBeUndefined();
    const { origin, axis } = plan.joints[3];
    for (const d of [-0.1, -0.03, 0, 0.03, 0.1]) expect(a(origin[0] + 0.05, origin[1] + axis[1] * d, origin[2] - 0.1)).toBe(b(origin[0] + 0.05, origin[1] + axis[1] * d, origin[2] - 0.1));
    expect(Object.keys(plan.joints[3].parent)).toEqual(['radius', 'depth', 'centre', 'waist']);
  });

  it('clears only the span across the interface', () => {
    const { f, plan } = cast(0.03);
    const { origin, axis, plane } = plan.joints[3];
    const at = (d: number): [number, number, number] => [origin[0] + axis[0] * (plane + d), origin[1] + axis[1] * (plane + d), origin[2] + axis[2] * (plane + d)];
    expect(f(...at(0.015))).toBeGreaterThan(0);
  });
});

describe('an exploded joint', () => {
  /** How far a joint's child stage moves against its parent stage, at the zero pose. */
  const opening = (k: number, raw: Record<string, unknown>) => {
    const spec = parseRobot(raw);
    const asm = buildSpecAssembly(spec);
    const chain = chainFromSpec(spec);
    const frames = chainFrames(chain, zeroPose(chain));
    const [parent, child] = asm.root.children.filter((c) => c.userData.module === `joint:${spec.links[k].name}`);
    const apart = (explode: number) => {
      asm.update([frames], explode);
      asm.root.updateMatrixWorld(true);
      return child.getWorldPosition(new THREE.Vector3()).sub(parent.getWorldPosition(new THREE.Vector3()));
    };
    return { shift: apart(1).sub(apart(0)), plan: planChain(spec).joints[k] };
  };

  it('opens a reversed hinge away from its parent', () => {
    const { shift, plan } = opening(2, read('puma560'));
    expect(shift.dot(new THREE.Vector3(...plan.axis))).toBeGreaterThan(0);
  });

  it('opens along a direction of its own when told to, in the arm plane and not across it', () => {
    const raw = read('irb120');
    const { shift } = opening(1, { ...raw, design: { ...raw.design, joints: { ...raw.design.joints, axis2: { ...raw.design.joints.axis2, drive: { ...raw.design.joints.axis2.drive, opens: 0.1, along: [0, 0, 1] } } } } });
    expect(shift.z).toBeCloseTo(0.1, 9);
    expect(Math.abs(shift.y)).toBeLessThan(1e-9);
  });

  it('leaves a joint with a plain gap on its axis', () => {
    const { shift, plan } = opening(1, read('iiwa14'));
    expect(Math.abs(shift.dot(new THREE.Vector3(...plan.axis)))).toBeCloseTo(shift.length(), 9);
  });

  it('opens a hinge the plan turned by itself the same way', () => {
    const { shift, plan } = opening(2, read('ur5e'));
    expect(plan.axis[1]).toBeLessThan(0);
    expect(shift.dot(new THREE.Vector3(...plan.axis))).toBeGreaterThan(0);
  });
});
