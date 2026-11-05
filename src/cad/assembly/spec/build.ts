/** Procedural CAD for a studio robot: its castings, then its tool and what it stands on. */
import * as THREE from 'three';
import { chainFrames } from '../../../core/chain/kinematics/frames';
import type { ChainFrames } from '../../../core/chain/model/types';
import { chainFromSpec } from '../../../core/chain/model/from-spec';
import { homePose } from '../../../core/robot/config/pose';
import { EFFECTOR_KINDS } from '../../../core/robot/effectors/kinds';
import type { RobotSpec } from '../../../core/robot/schema/types';
import { partOf, settle } from '../../common/part';
import { v3 } from '../../common/orient';
import { MaterialSet } from '../../materials/library';
import { EFFECTOR_BUILDERS } from '../../registry/effectors';
import { collectHull } from '../hull/collect';
import { type Assembly, type EffectorRig, moduleOf } from '../types';
import { toolSize } from './body';
import { castingBody } from './castings';
import { type Gap, type Slot, poseSlots } from './slots';

const tagModule = (g: THREE.Object3D, id: string) => ((g.userData.module = id), g);

/**
 * How much further the `ids` modules' parts reach along `local` (in the frame of `carrier`, which the tool
 * rides) when fully exploded than when assembled. Leaves the robot posed at home, assembled.
 */
function extraReach(root: THREE.Object3D, slots: Slot[], home: ChainFrames, gaps: Gap[], ids: Set<string>, carrier: THREE.Object3D, local: THREE.Vector3): number {
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
  const { slots, modules, gaps, indicators, lastStage, stand, follow } = castingBody(spec, mats, root);
  const lastLink = spec.links[spec.links.length - 1];
  const flange = v3(lastLink.offset);
  const tip = flange.clone().add(v3(spec.tool));
  const approach = [v3(spec.tool), v3(lastLink.offset), v3(lastLink.dofs.at(-1)!.axis)].find((v) => v.lengthSq() > 0)!;
  const size = toolSize(spec);
  const bare = !!spec.design?.bare;
  const rig = bare ? { group: new THREE.Group(), grip: null, reach: 0, payload: null } : EFFECTOR_BUILDERS[spec.effector]({ mats, flange, tip, approach, size, payload: spec.payload_mass });
  const ax = approach.clone().normalize();
  const tool = {
    approach: ax.toArray(),
    side: new THREE.Vector3(1, 0, 0).applyQuaternion(rig.group.quaternion).toArray(),
    beyond: Math.max(0, rig.reach - tip.clone().sub(flange).dot(ax)),
  };
  const effector: EffectorRig = { ...rig, kind: spec.effector, size, tool };
  lastStage.add(tagModule(effector.group, 'tool'));
  if (!bare) modules.push({ id: 'tool', label: EFFECTOR_KINDS[spec.effector].label, kind: 'End effector', joints: [] });

  if (spec.design?.section) root.userData.section = spec.design.section;
  const home = chainFrames(chainFromSpec(spec), homePose(spec));
  const floorZ = stand(home);
  settle(root);
  // The wrist opens along the approach too; the tool's own stack starts past whatever it pushes out.
  const wristOpen = extraReach(root, slots, home, gaps, new Set([`joint:${lastLink.name}`, `link:${lastLink.name}`]), lastStage, ax);
  const toolShift = wristOpen > 0 ? wristOpen + size * 0.4 : 0;

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
      follow();
      effector.group.position.copy(flange).addScaledVector(ax, toolShift * explode);
    },
    dispose() {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      mats.dispose();
    },
  };
}
