import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ToolMount } from '@/cad/assembly/mjcf/mounts';
import { buildRig, insertInBody, toolBody, toolSite, withXml } from '@/cad/assembly/mjcf/tool';
import { buildSpecAssembly } from '@/cad/assembly/spec/build';
import { moduleOf } from '@/cad/assembly/types';
import { partOf, settle } from '@/cad/common/part';
import { MaterialSet } from '@/cad/materials/library';
import { EFFECTOR_BUILDERS } from '@/cad/registry/effectors';
import { explodeParts } from '@/scene/teardown/explode';
import { chainFrames, forwardKinematics } from '@/core/chain/kinematics/frames';
import { chainFromSpec } from '@/core/chain/model/from-spec';
import { EFFECTOR_KINDS, EFFECTOR_LIST } from '@/core/robot/effectors/kinds';
import { toPythonDict, toStudioDict } from '@/core/robot/io/export';
import { withEffector } from '../support/robots';
import { homePose } from '@/core/robot/config/pose';
import { parseRobot } from '@/core/robot/schema/parse';
import type { EffectorKind } from '@/core/robot/schema/types';
import { modelChecker } from '@/physics/collision/from-model';
import { chainFromModel } from '@/physics/extract/chain/from-model';
import { ModelHandle } from '@/physics/model/handle';
import { OBJ, state } from '@/physics/runtime/arrays';
import { hullOf } from '@/cad/common/hull';

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

  it('no tool runs back past its plate, so nothing of it can reach the wrist behind it', () => {
    const s = 0.04;
    for (const e of EFFECTOR_LIST) for (const along of [0, 7]) {
      const rig = EFFECTOR_BUILDERS[e.kind]({ mats: new MaterialSet(), flange: new THREE.Vector3(), tip: new THREE.Vector3(0, along * s, 0), approach: new THREE.Vector3(0, 1, 0), size: s, payload: 0 });
      rig.group.updateMatrixWorld(true);
      // The adapter's centring spigot is the one part meant to sit in the flange.
      expect(new THREE.Box3().setFromObject(rig.group).min.y, e.kind).toBeGreaterThanOrEqual(-0.05 * s - 1e-9);
    }
  });

  it('a hose port stays inside the hull it brings', () => {
    const s = 0.04;
    for (const kind of ['suction', 'torch', 'spindle'] as EffectorKind[]) {
      const rig = EFFECTOR_BUILDERS[kind]({ mats: new MaterialSet(), flange: new THREE.Vector3(), tip: new THREE.Vector3(), approach: new THREE.Vector3(0, 1, 0), size: s, payload: 0 });
      rig.group.updateMatrixWorld(true);
      const hulls: THREE.Box3[] = [], ports: THREE.Box3[] = [];
      rig.group.traverse((o) => {
        const hull = hullOf(o);
        if (hull?.shape === 'box') {
          const c = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld), half = new THREE.Vector3(...(hull.size as [number, number, number]));
          hulls.push(new THREE.Box3(c.clone().sub(half), c.clone().add(half)).expandByScalar(1e-9));
        }
        if ((o as THREE.Mesh).isMesh && partOf(o)?.layer === 'cable') ports.push(new THREE.Box3().setFromObject(o));
      });
      expect(ports, kind).toHaveLength(2);
      for (const p of ports) expect(hulls.some((h) => h.containsBox(p)), kind).toBe(true);
    }
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

describe('a tool compiled into an imported arm', () => {
  const ARM = (flange: string) => `<mujoco><default><geom contype="1" conaffinity="1"/></default><worldbody>
    <body name="base"><geom type="cylinder" size="0.05 0.05" pos="0 0 0.05"/>
      <body name="l1" pos="0 0 0.1"><inertial pos="0.15 0 0" mass="1" diaginertia="0.01 0.01 0.01"/><joint name="j1" axis="0 1 0" range="-3 3"/><geom type="capsule" fromto="0.06 0 0 0.3 0 0" size="0.02"/>
        <body name="l2" pos="0.3 0 0"><inertial pos="0.1 0 0" mass="1" diaginertia="0.01 0.01 0.01"/><joint name="j2" axis="0 1 0" range="-3 3"/><geom type="capsule" fromto="0.05 0 0 0.2 0 0" size="0.02"/>${flange}</body>
      </body>
    </body></worldbody><keyframe><key name="home" qpos="0.2 0.3"/></keyframe></mujoco>`;
  const mount = (body: string): ToolMount => ({ limb: 0, body, pos: [0.2, 0, 0], quat: [Math.SQRT1_2, 0, Math.SQRT1_2, 0] });
  const bytes = (xml: string) => new Map([['robot.xml', new TextEncoder().encode(xml)]]);

  async function fitted(kind: EffectorKind) {
    const rig = buildRig(kind, 0.03, new MaterialSet());
    const files = withXml(bytes(ARM('')), 'robot.xml', [{ body: 'l2', xml: toolBody('Tool', mount('l2'), rig) }]);
    return { rig, h: await ModelHandle.fromFiles(files, 'robot.xml') };
  }

  it('goes inside a body, opening one that was self-closed', () => {
    expect(insertInBody('<a><body name="x" pos="0 0 0"/></a>', 'x', '<site/>')).toBe('<a><body name="x" pos="0 0 0"><site/></body></a>');
    expect(insertInBody('<body name="x"><joint/></body>', 'x', '<site/>')).toBe('<body name="x"><site/><joint/></body>');
    expect(insertInBody('<body name="xy"/>', 'x', '<site/>')).toBeNull();
  });

  it('finds the body in an included file, and refuses a mount with no body', () => {
    const files = new Map([['robot.xml', new TextEncoder().encode('<mujoco/>')], ['arm.xml', new TextEncoder().encode('<body name="x"/>')]]);
    expect(new TextDecoder().decode(withXml(files, 'robot.xml', [{ body: 'x', xml: '<site/>' }]).get('arm.xml'))).toContain('<site/>');
    expect(() => withXml(files, 'robot.xml', [{ body: 'y', xml: '<site/>' }])).toThrow('no body y');
  });

  it('adds no joint, so qpos and the home keyframe stay as they were', async () => {
    const bare = await ModelHandle.fromFiles(bytes(ARM('')), 'robot.xml');
    const { h } = await fitted('parallel');
    const [a, b] = [bare.model, h.model] as unknown as { nq: number; nkey: number; nbody: number }[];
    expect([b.nq, b.nkey]).toEqual([a.nq, a.nkey]);
    expect(b.nbody).toBe(a.nbody + 1);
    bare.dispose();
    h.dispose();
  });

  it('puts the tool point on the working end, and the chain agrees with MuJoCo there', async () => {
    const { h, rig } = await fitted('parallel');
    const mc = chainFromModel(h, ['j1', 'j2'], { site: toolSite(0) });
    const q = [0.4, -0.7];
    const d = state(h.data);
    d.qpos.set(q);
    h.mj.mj_kinematics(h.model, h.data);
    const s = h.id(OBJ.site, toolSite(0));
    const tip = forwardKinematics(mc.chain, q);
    expect(Math.hypot(...tip.p.map((v, k) => v - d.site_xpos[3 * s + k]))).toBeLessThan(1e-9);
    // Tool +z runs along l2's x here, so the point stands reach beyond the flange.
    const at = [0.2 + rig.reach, 0, 0];
    expect(Math.hypot(...mc.chain.tip.p.map((v, k) => v - at[k]))).toBeLessThan(1e-5);
    h.dispose();
  });

  it('hits the floor and the arm through its own hull', async () => {
    const { h } = await fitted('parallel');
    const tool = h.id(OBJ.body, 'Tool');
    const rest = new Float64Array(2);
    const c = modelChecker(h, { qposAdr: [0, 1], rest, home: [0, 0], floorZ: -0.13, tol: 1e-4, tools: [tool] });
    expect(c.hit([0, 0])).toBeNull();
    // Only the tool reaches the floor here: the links stay above it.
    expect(c.hit([0, 1.57])).toEqual({ a: 'Tool', b: 'floor' });
    // Folded back, the tool lands in the base.
    const hit = c.hit([0, 2.85]);
    expect(hit && [hit.a, hit.b].sort()).toEqual(['Tool', 'base']);
    c.dispose();
    h.dispose();
  });

  it('has a rig for every tool: jaws, a cup or nothing to grip with', () => {
    for (const { kind } of EFFECTOR_LIST) {
      const rig = buildRig(kind, 0.03, new MaterialSet());
      expect(rig.tool.approach).toEqual([0, 0, 1]);
      expect(rig.tool.beyond).toBe(0);
      expect(!!rig.grip).toBe(EFFECTOR_KINDS[kind].grips);
      expect(rig.reach).toBeGreaterThan(0);
    }
  });
});
