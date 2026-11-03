/** Per-look stand-ins for each original material, created once and reused. */
import * as THREE from 'three';
import { MATERIAL_INFO, type MaterialClass } from '../../cad/materials/classes/types';
import type { Look } from './types';

export class LookVariants {
  private cache = new Map<string, THREE.Material>();
  private ids = new WeakMap<THREE.Material, number>();
  private next = 0;

  private key(m: THREE.Material, look: Look, cls: MaterialClass) {
    if (!this.ids.has(m)) this.ids.set(m, this.next++);
    return look === 'studio' ? `${this.ids.get(m)}` : look === 'materials' ? `materials:${cls}` : look;
  }

  /** Clay and Technical share one material each; Materials shares one per class. */
  base(original: THREE.Material, look: Look, cls: MaterialClass): THREE.Material {
    if (look === 'studio') return original;
    const key = this.key(original, look, cls);
    let m = this.cache.get(key);
    if (!m) {
      if (look === 'clay') m = new THREE.MeshStandardMaterial({ color: '#d8d3cb', roughness: 0.88, metalness: 0 });
      else if (look === 'technical') m = new THREE.MeshStandardMaterial({ color: '#fbfbfa', roughness: 1, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0.35 });
      else m = new THREE.MeshStandardMaterial({ color: MATERIAL_INFO[cls].swatch, roughness: 0.6, metalness: 0, transparent: cls === 'glass', opacity: cls === 'glass' ? 0.5 : 1 });
      this.cache.set(key, m);
    }
    return m;
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}
