/** Applies cut mode and isolation to an assembly by swapping each mesh's material. */
import * as THREE from 'three';
import { partOf } from '../../cad/common/part';
import { moduleOf } from '../../cad/assembly/types';
import { LookVariants } from '../look/variants';
import { INK_OPACITY, type Look } from '../look/types';
import { addInk } from './ink';
import { type Cut, MaterialVariants } from './materials';

export class Cutaway {
  private readonly variants: MaterialVariants;
  private readonly originals = new Map<THREE.Mesh, THREE.Material>();
  private readonly ink: THREE.LineSegments[];
  private readonly looks = new LookVariants();

  constructor(root: THREE.Object3D, kind: 'procedural' | 'cad') {
    this.variants = new MaterialVariants(kind === 'cad' ? 0.3 : 0.13);
    this.ink = addInk(root, kind);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) this.originals.set(m, m.material as THREE.Material);
    });
  }

  get plane(): THREE.Plane {
    return this.variants.plane;
  }

  apply(cut: Cut, isolate: string | null, look: Look = 'studio'): void {
    const all = new Set<THREE.Material>();
    for (const [mesh, original] of this.originals) {
      const meta = partOf(mesh);
      const inFocus = !isolate || moduleOf(mesh) === isolate;
      const base = meta && meta.layer !== 'kinematic' ? this.looks.base(original, look, meta.material) : original;
      let material = base;
      if (!inFocus) material = this.variants.ghostOf(base);
      else if (cut === 'glass' && meta?.layer === 'housing') material = this.variants.glassOf(base);
      mesh.material = material;
      mesh.castShadow = inFocus && material.opacity >= 1;
      if (meta?.layer === 'kinematic') mesh.visible = cut === 'glass';
      all.add(material);
    }
    for (const line of this.ink) all.add(line.material as THREE.Material);
    this.variants.clip(all, cut === 'section');
    for (const line of this.ink) {
      line.visible = !isolate || moduleOf(line) === isolate;
      (line.material as THREE.LineBasicMaterial).opacity = INK_OPACITY[look];
    }
  }

  /** A vertical section through `center`, facing the camera's right-hand side. */
  aim(center: THREE.Vector3, camera: THREE.Camera): void {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    right.z = 0;
    if (right.lengthSq() < 1e-9) right.set(1, 0, 0);
    this.variants.plane.setFromNormalAndCoplanarPoint(right.normalize().negate(), center);
  }

  dispose(): void {
    for (const line of this.ink) {
      line.removeFromParent();
      line.geometry.dispose();
    }
    for (const [mesh, original] of this.originals) mesh.material = original;
    this.variants.dispose();
    this.looks.dispose();
  }
}
