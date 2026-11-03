/** Procedural CAD for a studio robot: a module per joint, tubes between them, tool, pedestal. */
import * as THREE from 'three';
import { linkJointStart } from '../../../core/chain/model/from-spec';
import { identityTransform } from '../../../core/math/linear/transform';
import type { RobotSpec } from '../../../core/robot/schema/types';
import { settle } from '../../common/part';
import { v3 } from '../../common/orient';
import { MaterialSet } from '../../materials/library';
import { buildPedestal } from '../../parts/base/pedestal';
import { buildGripper } from '../../parts/effectors/gripper';
import { buildTube } from '../../parts/links/tube';
import { type JointModule, moduleRadius } from '../../parts/types';
import { JOINT_MODULES } from '../../registry/joint-modules';
import { JOINT_KINDS } from '../../../core/robot/joints/kinds';
import type { Assembly, ModuleInfo } from '../types';
import { type Slot, poseSlots } from './slots';

const tagModule = (g: THREE.Object3D, id: string) => ((g.userData.module = id), g);

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
      slots.push({ group: tagModule(stage, id) as THREE.Group, frame: (f) => (i === 0 ? f.pre[starts[k]] : f.frames[dof]), before: starts[k] + i });
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
  lastStage.add(tagModule(buildGripper({ mats, flange, tip, approach, size: moduleRadius(lastLink) * 0.55, payload: spec.payload_mass }), 'tool'));
  modules.push({ id: 'tool', label: 'Gripper', kind: 'End effector', joints: [] });

  const R0 = moduleRadius(spec.links[0]);
  const base = v3(spec.base);
  const drop = built[0].exit(new THREE.Vector3(0, 0, -1));
  const top = base.z - Math.min(drop, R0 * 3) * 0.9;
  const floorZ = Math.min(0, top - R0 * 0.5);
  const baseSlot = new THREE.Group();
  baseSlot.add(buildPedestal(mats, base, floorZ, top, R0));
  root.add(tagModule(baseSlot, 'base'));
  slots.push({ group: baseSlot, frame: () => identityTransform(), before: 0 });
  modules.unshift({ id: 'base', label: 'Pedestal', kind: 'Base', joints: [] });
  settle(root);

  const indicators = built.flatMap((m, k) => spec.links[k].dofs.map((_, i) => m.indicators[i] ?? null));
  return {
    kind: 'procedural',
    root,
    mats,
    modules,
    indicators,
    floorZ,
    update: (limbs, explode) => poseSlots(slots, limbs[0], gaps, explode),
    dispose() {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      mats.dispose();
    },
  };
}
