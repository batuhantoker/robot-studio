/** Assembly for an edited CAD twin: real meshes where the link is unchanged, procedural elsewhere. */
import * as THREE from 'three';
import { chainFromSpec, linkJointStart } from '../../../core/chain/model/from-spec';
import type { Twin } from '../../../core/chain/twin/spec-from-chain';
import { identityTransform } from '../../../core/math/linear/transform';
import type { RobotSpec } from '../../../core/robot/schema/types';
import type { ModelChain } from '../../../physics/extract/chain/from-model';
import { readMesh } from '../../../physics/extract/geoms';
import type { ModelHandle } from '../../../physics/model/handle';
import { settle, tag } from '../../common/part';
import { MaterialSet } from '../../materials/library';
import { meshGeometry, primitiveGeometry } from '../mjcf/geometry';
import { type Slot, poseSlots } from '../spec/slots';
import { collectHull } from '../hull/collect';
import type { Assembly, ModuleInfo } from '../types';
import { type BoundGeom, bindGeoms } from './bind';
import { cadPlan } from './match';
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

export function buildHybridAssembly(spec: RobotSpec, rest: Twin, h: ModelHandle, mc: ModelChain, scale: number): Assembly {
  const mats = new MaterialSet();
  const root = new THREE.Group();
  const bound = bindGeoms(h, mc, rest);
  const starts = linkJointStart(spec);
  const slots: Slot[] = [];
  const modules: ModuleInfo[] = [{ id: 'base', label: 'Base', kind: 'Base (CAD)', joints: [] }];
  const gaps: number[] = [];
  const indicators: (THREE.Mesh | null)[] = [];
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
      modules.push({ id, label: link.name, kind: plan.length !== plan.restLength ? 'CAD · stretched' : 'CAD', joints: [starts[k]] });
      gaps.push(scale * 0.07);
      indicators.push(null);
      return;
    }
    const p = proceduralLink(spec, k, mats, starts, slots, modules);
    p.stages.forEach((s) => root.add(s));
    link.dofs.forEach(() => gaps.push(p.size * 1.3 / link.dofs.length));
    indicators.push(...p.indicators);
  });
  settle(root);
  return {
    kind: 'cad', root, mats, modules, indicators, floorZ: 0,
    hull: collectHull(slots, chainFromSpec(spec)),
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
