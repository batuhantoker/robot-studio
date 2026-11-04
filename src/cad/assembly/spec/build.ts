/** Procedural CAD for a studio robot: a module per joint, tubes between them, tool, pedestal. */
import * as THREE from 'three';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import type { ChainFrames } from '../../../core/chain/model/types';
import { chainFromSpec, linkJointStart } from '../../../core/chain/model/from-spec';
import { identityTransform } from '../../../core/math/linear/transform';
import { homePose, reachEstimate } from '../../../core/robot/config/pose';
import { EFFECTOR_KINDS } from '../../../core/robot/effectors/kinds';
import type { RobotSpec } from '../../../core/robot/schema/types';
import { lowestSolidZ } from '../../common/lowest';
import { partOf, settle } from '../../common/part';
import { v3 } from '../../common/orient';
import { MaterialSet } from '../../materials/library';
import { buildPedestal } from '../../parts/base/pedestal';
import { buildTube } from '../../parts/links/tube';
import { type JointModule, moduleRadius } from '../../parts/types';
import { EFFECTOR_BUILDERS } from '../../registry/effectors';
import { JOINT_MODULES } from '../../registry/joint-modules';
import { JOINT_KINDS } from '../../../core/robot/joints/kinds';
import { collectHull } from '../hull/collect';
import { type Assembly, type EffectorRig, type ModuleInfo, moduleOf } from '../types';
import { type Slot, poseSlots } from './slots';

const tagModule = (g: THREE.Object3D, id: string) => ((g.userData.module = id), g);

/**
 * How much further the `ids` modules' parts reach along `local` (in the frame of `carrier`, which the tool
 * rides) when fully exploded than when assembled. Leaves the robot posed at home, assembled.
 */
function extraReach(root: THREE.Object3D, slots: Slot[], home: ChainFrames, gaps: number[], ids: Set<string>, carrier: THREE.Object3D, local: THREE.Vector3): number {
  const parts: THREE.Mesh[] = [];
  root.traverse((o) => partOf(o) && (o as THREE.Mesh).isMesh && ids.has(moduleOf(o) ?? '') && parts.push(o as THREE.Mesh));
  const box = new THREE.Box3(), c = new THREE.Vector3(), h = new THREE.Vector3(), at = new THREE.Vector3();
  const place = (amount: number) => {
    poseSlots(slots, home, gaps, amount);
    for (const o of parts) o.position.copy(partOf(o)!.rest).addScaledVector(partOf(o)!.explode, amount);
    root.updateMatrixWorld(true);
  };
  const reach = (amount: number) => {
    place(amount);
    const dir = local.clone().transformDirection(carrier.matrixWorld);
    const origin = carrier.getWorldPosition(at).dot(dir);
    let most = -Infinity;
    for (const o of parts) {
      box.setFromObject(o).getCenter(c);
      box.getSize(h).multiplyScalar(0.5);
      most = Math.max(most, c.dot(dir) + Math.abs(h.x * dir.x) + Math.abs(h.y * dir.y) + Math.abs(h.z * dir.z) - origin);
    }
    return most;
  };
  const extra = parts.length ? reach(1) - reach(0) : 0;
  place(0);
  return Math.max(0, extra);
}

export function buildSpecAssembly(spec: RobotSpec): Assembly {
  const mats = new MaterialSet();
  const root = new THREE.Group();
  const starts = linkJointStart(spec);
  const built: JointModule[] = spec.links.map((link, index) => JOINT_MODULES[link.joint]({ mats, link, index }));
  const slots: Slot[] = [];
  const modules: ModuleInfo[] = [];
  const gaps: number[] = [];
  spec.links.forEach((link, k) => {
    const m = built[k];
    const id = `joint:${link.name}`;
    modules.push({ id, label: link.name, kind: JOINT_KINDS[link.joint].label, joints: link.dofs.map((_, i) => starts[k] + i) });
    m.stages.forEach((stage, i) => {
      const dof = starts[k] + i - 1;
      slots.push({ group: tagModule(stage, id) as THREE.Group, frame: (f) => (i === 0 ? f.pre[starts[k]] : f.frames[dof]), body: i === 0 ? starts[k] - 1 : dof, before: starts[k] + i });
      root.add(stage);
    });
    link.dofs.forEach(() => gaps.push((m.size * 1.3) / link.dofs.length));
    const last = m.stages[m.stages.length - 1];
    const offset = v3(link.offset);
    const dir = offset.clone().normalize();
    const next = built[k + 1];
    const tube = offset.lengthSq() > 0
      ? buildTube({ mats, offset, radius: link.radius, startTrim: m.exit(dir), endTrim: next ? next.exit(dir.clone().negate()) : 0 })
      : null;
    if (tube) {
      last.add(tagModule(tube, `link:${link.name}`));
      modules.push({ id: `link:${link.name}`, label: `${link.name} link`, kind: 'Link', joints: [] });
    }
  });
  const lastLink = spec.links[spec.links.length - 1];
  const lastStage = built[built.length - 1].stages.at(-1)!;
  const flange = v3(lastLink.offset);
  const tip = flange.clone().add(v3(spec.tool));
  const approach = [v3(spec.tool), v3(lastLink.offset), v3(lastLink.dofs.at(-1)!.axis)].find((v) => v.lengthSq() > 0)!;
  // Thin Python-study wrists would carry millimetre tools; keep the tool in proportion to the arm.
  const size = Math.max(moduleRadius(lastLink) * 0.55, 0.025 * reachEstimate(spec));
  const rig = EFFECTOR_BUILDERS[spec.effector]({ mats, flange, tip, approach, size, payload: spec.payload_mass });
  const ax = approach.clone().normalize();
  const tool = {
    approach: ax.toArray(),
    side: new THREE.Vector3(1, 0, 0).applyQuaternion(rig.group.quaternion).toArray(),
    beyond: Math.max(0, rig.reach - tip.clone().sub(flange).dot(ax)),
  };
  const effector: EffectorRig = { ...rig, kind: spec.effector, size, tool };
  lastStage.add(tagModule(effector.group, 'tool'));
  modules.push({ id: 'tool', label: EFFECTOR_KINDS[spec.effector].label, kind: 'End effector', joints: [] });

  const R0 = moduleRadius(spec.links[0]);
  const base = v3(spec.base);
  const drop = built[0].exit(new THREE.Vector3(0, 0, -1));
  const top = base.z - Math.min(drop, R0 * 3) * 0.9;
  // Measured at home, so a first module reaching below the column (a gantry's motor plate) still stands on the floor.
  const home = chainFrames(chainFromSpec(spec), homePose(spec));
  poseSlots(slots, home, gaps, 0);
  const floorZ = Math.min(0, top - R0 * 0.5, lowestSolidZ(root));
  const baseSlot = new THREE.Group();
  baseSlot.add(buildPedestal(mats, base, floorZ, top, R0));
  root.add(tagModule(baseSlot, 'base'));
  slots.push({ group: baseSlot, frame: () => identityTransform(), body: -1, before: 0 });
  modules.unshift({ id: 'base', label: 'Pedestal', kind: 'Base', joints: [] });
  settle(root);
  // The wrist opens along the approach too; the tool's own stack starts past whatever it pushes out.
  const wristOpen = extraReach(root, slots, home, gaps, new Set([`joint:${lastLink.name}`, `link:${lastLink.name}`]), lastStage, ax);
  const toolShift = wristOpen > 0 ? wristOpen + size * 0.4 : 0;

  const indicators = built.flatMap((m, k) => spec.links[k].dofs.map((_, i) => m.indicators[i] ?? null));
  return {
    kind: 'procedural',
    root,
    mats,
    modules,
    indicators,
    floorZ,
    hull: collectHull(slots, chainFromSpec(spec)),
    effector,
    update: (limbs, explode) => {
      poseSlots(slots, limbs[0], gaps, explode);
      effector.group.position.copy(flange).addScaledVector(ax, toolShift * explode);
    },
    dispose() {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      mats.dispose();
    },
  };
}
