/** Material variants per original: glass shells for x-ray, ghosts for isolate, clipped for section. */
import * as THREE from 'three';

export type Cut = 'solid' | 'glass' | 'section';

export class MaterialVariants {
  private glass = new Map<THREE.Material, THREE.Material>();
  private ghost = new Map<THREE.Material, THREE.Material>();
  readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private readonly glassOpacity = 0.13) {}

  glassOf(m: THREE.Material): THREE.Material {
    let v = this.glass.get(m);
    if (!v) {
      v = m.clone();
      Object.assign(v, { transparent: true, opacity: this.glassOpacity, depthWrite: false, side: THREE.DoubleSide });
      if ('envMapIntensity' in v) (v as THREE.MeshPhysicalMaterial).envMapIntensity = 1.4;
      this.glass.set(m, v);
    }
    return v;
  }

  ghostOf(m: THREE.Material): THREE.Material {
    let v = this.ghost.get(m);
    if (!v) {
      v = new THREE.MeshBasicMaterial({ color: '#9aa1aa', transparent: true, opacity: 0.07, depthWrite: false });
      this.ghost.set(m, v);
    }
    return v;
  }

  /** Clip every material against the section plane (and draw back faces so cuts show walls). */
  clip(materials: Iterable<THREE.Material>, on: boolean): void {
    for (const m of materials) {
      m.clippingPlanes = on ? [this.plane] : null;
      if (!this.glass.has(m) && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) m.side = on ? THREE.DoubleSide : THREE.FrontSide;
      m.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const v of [...this.glass.values(), ...this.ghost.values()]) v.dispose();
    this.glass.clear();
    this.ghost.clear();
  }
}
