/**
 * Assembly for an imported MJCF robot. Bodies are posed from MuJoCo (xpos/xquat); in exploded
 * views each body moves along the chain axes before it and its sub-meshes fan out from its CoM.
 */
import * as THREE from 'three';
import type { ChainFrames } from '../../../core/chain/model/types';
import type { ModelChain } from '../../../physics/extract/chain/from-model';
import type { BodyInfo } from '../../../physics/extract/bodies';
import { readGeoms, readMesh, visibleGeom } from '../../../physics/extract/geoms';
import type { ModelHandle } from '../../../physics/model/handle';
import { OBJ, state } from '../../../physics/runtime/arrays';
import { tag } from '../../common/part';
import { MaterialSet } from '../../materials/library';
import type { Assembly, ModuleInfo } from '../types';
import { meshGeometry, primitiveGeometry } from './geometry';
import { inertiaBox } from './inertia';
import { tendonCables } from './tendons';

/** Each body explodes with the limb in which it sits deepest (the trunk stays with no limb). */
function owners(bodies: BodyInfo[], limbs: ModelChain[]) {
  return bodies.map((b) => {
    let best = { limb: -1, joint: -1 };
    limbs.forEach((mc, l) => {
      if (mc.attach[b.id].joint > best.joint) best = { limb: l, joint: mc.attach[b.id].joint };
    });
    return best;
  });
}

export function buildMjcfAssembly(h: ModelHandle, bodies: BodyInfo[], limbs: ModelChain[], scale: number): Assembly {
  const own = owners(bodies, limbs);
  const mats = new MaterialSet();
  const root = new THREE.Group();
  const cache = new Map<number, THREE.BufferGeometry>();
  const groups = bodies.map((b) => {
    const g = new THREE.Group();
    g.userData.module = b.id === 0 ? 'base' : `body:${b.name}`;
    root.add(g);
    return g;
  });
  for (const geom of readGeoms(h).filter(visibleGeom)) {
    let geometry = geom.mesh >= 0 ? cache.get(geom.mesh) : primitiveGeometry(geom);
    if (geom.mesh >= 0 && !geometry) cache.set(geom.mesh, (geometry = meshGeometry(readMesh(h, geom.mesh))));
    if (!geometry) continue;
    const body = bodies[geom.body];
    const { material, cls } = mats.cad(geom.rgba, `${geom.name} ${body.name} ${geom.mesh >= 0 ? h.name(OBJ.mesh, geom.mesh) : ''}`);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...geom.pos);
    mesh.quaternion.set(geom.quat[1], geom.quat[2], geom.quat[3], geom.quat[0]);
    mesh.castShadow = mesh.receiveShadow = true;
    const away = mesh.position.clone().sub(new THREE.Vector3(...body.ipos));
    const fan = away.lengthSq() > 1e-12 ? away.normalize().multiplyScalar(scale * 0.05) : new THREE.Vector3();
    tag(mesh, { label: `${body.name}${geom.name ? ` · ${geom.name}` : ''}`, layer: 'housing', explode: fan, material: cls });
    groups[geom.body].add(mesh);
  }
  for (const b of bodies) {
    if (b.id === 0 || !groups[b.id].children.length) continue;
    const box = inertiaBox(b, new THREE.Box3().setFromObject(groups[b.id]).getSize(new THREE.Vector3()).length());
    if (box) groups[b.id].add(box);
  }
  const cables = tendonCables(h, mats);
  if (cables) root.add(cables.root);
  const modules: ModuleInfo[] = bodies
    .filter((b) => groups[b.id].children.length)
    .map((b) => ({
      id: groups[b.id].userData.module as string,
      label: b.name,
      kind: b.id === 0 ? 'Base' : 'Body',
      joints: own[b.id].limb >= 0 && bodies[b.id].joints.some((j) => limbs[own[b.id].limb].jointIds.includes(j)) ? [own[b.id].joint] : [],
      limb: own[b.id].limb,
    }));
  if (cables) modules.push({ id: 'tendon', label: 'Tendon', kind: 'Tendon', joints: [] });
  const gap = scale * 0.07;
  const d = state(h.data);
  // Real parts separate along the chain (joint to next joint), not along their spin axes.
  const shiftsOf = (f: ChainFrames, explode: number) => {
    const shifts: THREE.Vector3[] = [new THREE.Vector3()];
    f.axes.forEach((axis, j) => {
      const next = new THREE.Vector3(...(f.origins[j + 1] ?? f.tip.p)).sub(new THREE.Vector3(...f.origins[j]));
      const dir = next.lengthSq() > 1e-10 ? next.normalize() : new THREE.Vector3(...axis);
      shifts.push(shifts[j].clone().addScaledVector(dir, gap * explode));
    });
    return shifts;
  };
  const update = (frames: ChainFrames[], explode: number) => {
    const shifts = frames.map((f) => shiftsOf(f, explode));
    bodies.forEach((b, i) => {
      const g = groups[i];
      g.position.set(d.xpos[3 * i], d.xpos[3 * i + 1], d.xpos[3 * i + 2]);
      g.quaternion.set(d.xquat[4 * i + 1], d.xquat[4 * i + 2], d.xquat[4 * i + 3], d.xquat[4 * i]);
      const o = own[b.id];
      if (o.limb >= 0) g.position.add(shifts[o.limb][o.joint + 1]);
    });
    // Exploded bodies leave the tendon's path, which MuJoCo only knows assembled.
    if (cables) cables.root.visible = explode < 1e-3;
    if (cables?.root.visible) cables.update();
  };
  return {
    kind: 'cad',
    root,
    mats,
    modules,
    indicators: [],
    floorZ: 0,
    update,
    dispose() {
      cache.forEach((g) => g.dispose());
      cables?.dispose();
      mats.dispose();
    },
  };
}
