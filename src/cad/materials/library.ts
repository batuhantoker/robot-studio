/** Shared PBR materials by role; teardown swaps or fades them per part. */
import * as THREE from 'three';
import { PALETTE } from '../../scene/stage/palette';
import { inferMaterial } from './classes/infer';
import { physicalMaterial, srgb } from './classes/physical';
import type { MaterialClass } from './classes/types';

export type MaterialRole =
  | 'shell' | 'cap' | 'alu' | 'steel' | 'copper' | 'magnet' | 'rubber' | 'brass' | 'pcb' | 'accent' | 'payload';

const make = (): Record<MaterialRole, THREE.MeshPhysicalMaterial> => ({
  shell: new THREE.MeshPhysicalMaterial({ color: '#f3f4f6', roughness: 0.48, metalness: 0.04, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
  cap: new THREE.MeshPhysicalMaterial({ color: '#2b2f36', roughness: 0.55, metalness: 0.25 }),
  alu: new THREE.MeshPhysicalMaterial({ color: '#c4c9d0', roughness: 0.45, metalness: 0.75, envMapIntensity: 0.55 }),
  steel: new THREE.MeshPhysicalMaterial({ color: '#a9afb7', roughness: 0.3, metalness: 0.9, envMapIntensity: 0.6 }),
  copper: new THREE.MeshPhysicalMaterial({ color: '#c27a45', roughness: 0.34, metalness: 0.9 }),
  magnet: new THREE.MeshPhysicalMaterial({ color: '#3b4048', roughness: 0.45, metalness: 0.5 }),
  rubber: new THREE.MeshPhysicalMaterial({ color: '#24272c', roughness: 0.85, metalness: 0 }),
  brass: new THREE.MeshPhysicalMaterial({ color: '#b8964f', roughness: 0.35, metalness: 0.85 }),
  pcb: new THREE.MeshPhysicalMaterial({ color: '#1f5b45', roughness: 0.6, metalness: 0.1 }),
  accent: new THREE.MeshPhysicalMaterial({ color: PALETTE.accent, roughness: 0.4, emissive: PALETTE.accent, emissiveIntensity: 0.15 }),
  payload: new THREE.MeshPhysicalMaterial({ color: '#4b5058', roughness: 0.5, metalness: 0.3 }),
});

/** Materials are per assembly so teardown state never leaks between robots. */
export class MaterialSet {
  readonly byRole = make();

  get(role: MaterialRole): THREE.MeshPhysicalMaterial {
    return this.byRole[role];
  }

  private cadCache = new Map<string, THREE.MeshPhysicalMaterial>();

  /** Material for an imported CAD part: class inferred from colour and name, shared per class+colour. */
  cad(rgba: ArrayLike<number>, name: string): { material: THREE.MeshPhysicalMaterial; cls: MaterialClass } {
    const cls = inferMaterial(rgba, name);
    return { material: this.finish(cls, rgba), cls };
  }

  /** Material for a part whose finish is known rather than inferred. */
  finish(cls: MaterialClass, rgba: ArrayLike<number>): THREE.MeshPhysicalMaterial {
    const key = `${cls}:${Array.from(rgba).map((v) => v.toFixed(3)).join(',')}`;
    let material = this.cadCache.get(key);
    if (!material) this.cadCache.set(key, (material = physicalMaterial(cls, srgb(rgba))));
    return material;
  }

  dispose(): void {
    for (const m of [...Object.values(this.byRole), ...this.cadCache.values()]) m.dispose();
  }
}
