/** Assembly for an edited CAD twin: real meshes where the link is unchanged, procedural elsewhere. */
import * as THREE from 'three';
import { chainFromSpec, linkJointStart } from '../../../core/chain/model/from-spec';
import type { Twin } from '../../../core/chain/twin/spec-from-chain';
import { identityTransform } from '../../../core/math/linear/transform';
import type { RobotSpec } from '../../../core/robot/schema/types';
import type { ModelChain } from '../../../physics/extract/chain/from-model';
import { type GeomInfo, readMesh } from '../../../physics/extract/geoms';
import type { ModelHandle } from '../../../physics/model/handle';
import { OBJ } from '../../../physics/runtime/arrays';
import { v3 } from '../../common/orient';
import { settle, tag } from '../../common/part';
import { MaterialSet } from '../../materials/library';
import { EFFECTOR_BUILDERS } from '../../registry/effectors';
import { EFFECTOR_KINDS } from '../../../core/robot/effectors/kinds';
import { meshGeometry, primitiveGeometry } from '../mjcf/geometry';
import type { ToolMount } from '../mjcf/mounts';
import { toolSize } from '../spec/body';
import { type Slot, poseSlots } from '../spec/slots';
import { collectHull } from '../hull/collect';
import type { Assembly, EffectorRig, ModuleInfo } from '../types';
import { type BoundGeom, bindGeoms, matrixOf } from './bind';
import { cadPlan } from './match';
import { MODULE_SCALE } from '../../parts/types';
import { proceduralLink } from './procedural';
import { stretchGeometry, type StretchPlan } from './stretch';

function cadGroup(h: ModelHandle, mats: MaterialSet, bound: BoundGeom[], plan: StretchPlan | null, label: string) {
  const g = new THREE.Group();
  const cache = new Map<number, THREE.BufferGeometry>();
  for (const { geom, toLink } of bound) {
    let source = geom.mesh >= 0 ? cache.get(geom.mesh) : primitiveGeometry(geom);
    if (geom.mesh >= 0 && !source) cache.set(geom.mesh, (source = meshGeometry(readMesh(h, geom.mesh))));
    if (!source) continue;
    const geometry = plan ? stretchGeometry(source, toLink, plan) : source.clone().applyMatrix4(toLink);
    const { material, cls } = mats.cad(geom.rgba, `${geom.name} ${label}`);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    tag(mesh, { label: `${label}${geom.name ? ` · ${geom.name}` : ''}`, layer: 'housing', material: cls });
    g.add(mesh);
  }
  cache.forEach((c) => c.dispose());
  return g;
}

/** The link radius whose joint module fits inside this real link: a twin's radius is one guess for the whole arm, far too big at the wrist. */
function cadRadius(h: ModelHandle, mats: MaterialSet, bound: BoundGeom[] | undefined): number {
  if (!bound?.length) return Infinity;
  const g = cadGroup(h, mats, bound, null, '');
  const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).toArray().sort((a, b) => a - b);
  g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  return (0.5 * size[1]) / MODULE_SCALE;
}

/** Where a twin's tool goes: the arm's measured flange and the scale tools are drawn at there, and the CAD geoms a tool takes the place of. */
export interface TwinFit {
  mount: ToolMount | null;
  size: number | null;
  hides?: (geom: GeomInfo) => boolean;
}

/** The measured flange in the last link's frame, carried along with any edit to that link's length. */
function flangeFrame(spec: RobotSpec, rest: Twin, h: ModelHandle, mc: ModelChain, mount: ToolMount): THREE.Matrix4 | null {
  const last = spec.links.length - 1;
  const at = mc.attach[h.id(OBJ.body, mount.body)];
  if (last !== rest.spec.links.length - 1 || at?.joint !== last) return null;
  const [w, x, y, z] = mount.quat;
  const seat = new THREE.Matrix4().compose(new THREE.Vector3(...mount.pos), new THREE.Quaternion(x, y, z, w), new THREE.Vector3(1, 1, 1));
  const frame = matrixOf(rest.rotations[last], [0, 0, 0]).multiply(matrixOf(at.T.R, at.T.p)).multiply(seat);
  const stretch = v3(spec.links[last].offset).sub(new THREE.Vector3(...rest.restOffsets[last]));
  return new THREE.Matrix4().makeTranslation(stretch).multiply(frame);
}

/** The tool a twin wears, in its last link's frame; `flange` keeps the CAD's own end as it is. */
function twinTool(spec: RobotSpec, rest: Twin, h: ModelHandle, mc: ModelChain, mats: MaterialSet, fit?: TwinFit): EffectorRig | null {
  if (spec.effector === 'flange') return null;
  const link = spec.links[spec.links.length - 1];
  const end = v3(link.offset), tip = end.clone().add(v3(spec.tool));
  const size = fit?.size ?? toolSize(spec);
  const seat = fit?.mount ? flangeFrame(spec, rest, h, mc, fit.mount) : null;
  const origin = new THREE.Vector3(), out = new THREE.Vector3(0, 0, 1);
  const approach = [v3(spec.tool), end, v3(link.dofs.at(-1)!.axis)].find((v) => v.lengthSq() > 0)!;
  const rig = seat
    ? EFFECTOR_BUILDERS[spec.effector]({ mats, flange: origin, tip: origin, approach: out, size, payload: spec.payload_mass })
    : EFFECTOR_BUILDERS[spec.effector]({ mats, flange: end, tip, approach, size, payload: spec.payload_mass });
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.group.quaternion);
  const ax = approach.clone().normalize();
  let group = rig.group, from = end;
  if (seat) {
    group = new THREE.Group();
    group.add(rig.group);
    seat.decompose(group.position, group.quaternion, group.scale);
    ax.copy(out).applyQuaternion(group.quaternion);
    side.applyQuaternion(group.quaternion);
    from = group.position;
  }
  const beyond = Math.max(0, from.clone().addScaledVector(ax, rig.reach).sub(tip).dot(ax));
  group.userData.module = 'tool';
  return { ...rig, group, kind: spec.effector, size, tool: { approach: ax.toArray(), side: side.toArray(), beyond } };
}

export function buildHybridAssembly(spec: RobotSpec, rest: Twin, h: ModelHandle, mc: ModelChain, scale: number, fit?: TwinFit): Assembly {
  const mats = new MaterialSet();
  const root = new THREE.Group();
  const effector = twinTool(spec, rest, h, mc, mats, fit);
  const bound = bindGeoms(h, mc, rest, effector ? fit?.hides : undefined);
  const starts = linkJointStart(spec);
  const slots: Slot[] = [];
  const modules: ModuleInfo[] = [{ id: 'base', label: 'Base', kind: 'Base (CAD)', joints: [], limb: -1 }];
  const gaps: number[] = [];
  const indicators: (THREE.Mesh | null)[] = [];
  let lastStage: THREE.Object3D = root;
  const baseGroup = cadGroup(h, mats, bound.base, null, 'base');
  baseGroup.userData.module = 'base';
  root.add(baseGroup);
  slots.push({ group: baseGroup, frame: () => identityTransform(), body: -1, before: 0 });
  spec.links.forEach((link, k) => {
    const plan = cadPlan(link, k, rest);
    const id = `joint:${link.name}`;
    if (plan && bound.links[k]) {
      const g = cadGroup(h, mats, bound.links[k], plan, link.name);
      g.userData.module = id;
      root.add(g);
      slots.push({ group: g, frame: (f) => f.frames[starts[k]], body: starts[k], before: starts[k] + 1 });
      modules.push({ id, label: link.name, kind: plan.delta.lengthSq() > 1e-12 ? 'CAD · stretched' : 'CAD', joints: [starts[k]] });
      gaps.push(scale * 0.07);
      indicators.push(null);
      lastStage = g;
      return;
    }
    const p = proceduralLink({ ...link, radius: Math.min(link.radius, cadRadius(h, mats, bound.links[Math.min(k, bound.links.length - 1)])) }, k, mats, starts, slots, modules);
    p.stages.forEach((s) => root.add(s));
    link.dofs.forEach(() => gaps.push(p.size * 1.3 / link.dofs.length));
    indicators.push(...p.indicators);
    lastStage = p.stages.at(-1)!;
  });
  if (effector) {
    lastStage.add(effector.group);
    modules.push({ id: 'tool', label: EFFECTOR_KINDS[effector.kind].label, kind: 'End effector', joints: [] });
  }
  settle(root);
  return {
    kind: 'cad', root, mats, modules, indicators, floorZ: 0,
    hull: collectHull(slots, chainFromSpec(spec)),
    ...(effector ? { effector } : {}),
    update: (limbs, explode) => poseSlots(slots, limbs[0], gaps, explode),
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      mats.dispose();
    },
  };
}
