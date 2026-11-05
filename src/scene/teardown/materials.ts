/** Material variants per original: glass shells for x-ray, ghosts for isolate, clipped for section. */
import * as THREE from 'three';

export type Cut = 'solid' | 'glass' | 'section';

export class MaterialVariants {
  private glass = new Map<THREE.Material, THREE.Material>();
  private ghost = new Map<THREE.Material, THREE.Material>();
  private stepped = new Map<THREE.Material, Map<THREE.Plane, THREE.Material>>();
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

  /** The same material against a plane of its own, for a part cut nearer the camera than the rest. */
  steppedOf(m: THREE.Material, plane: THREE.Plane): THREE.Material {
    const key = this.stepped.get(m) ?? new Map<THREE.Plane, THREE.Material>();
    this.stepped.set(m, key);
    let v = key.get(plane);
    if (!v) {
      v = m.clone();
      Object.assign(v, { clippingPlanes: [plane], clipShadows: true });
      key.set(plane, v);
    }
    return v;
  }

  /** Clip every material against the section plane; the cutaway's caps close what the cut opens. */
  clip(materials: Iterable<THREE.Material>, on: boolean): void {
    for (const m of materials) {
      m.clippingPlanes = on ? [this.plane] : null;
      m.clipShadows = on;
      m.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const v of [...this.glass.values(), ...this.ghost.values(), ...[...this.stepped.values()].flatMap((m) => [...m.values()])]) v.dispose();
    this.glass.clear();
    this.ghost.clear();
    this.stepped.clear();
  }
}
