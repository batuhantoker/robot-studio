/** Applies cut mode and isolation to an assembly by swapping each mesh's material. */
import * as THREE from 'three';
import { partOf } from '../../cad/common/part';
import { moduleOf } from '../../cad/assembly/types';
import { LookVariants } from '../look/variants';
import { INK_OPACITY, type Look } from '../look/types';
import { addInk } from './ink';
import { type Cut, MaterialVariants } from './materials';

/** A world-space stand-in for one part, drawn only in section. */
interface Mirror {
  source: THREE.Object3D;
  copies: THREE.Object3D[];
  cap: THREE.Mesh | null;
  inFocus: boolean;
}

const hidden = (o: THREE.Object3D | null): boolean => !!o && (!o.visible || hidden(o.parent));

export class Cutaway {
  private readonly variants: MaterialVariants;
  private readonly originals = new Map<THREE.Mesh, THREE.Material>();
  private readonly ink: THREE.LineSegments[];
  private readonly looks = new LookVariants();
  /** Section extras, in world space: back faces drawn flat read as solid caps, and a ghost keeps the half cut away. */
  readonly section = new THREE.Group();
  private mirrors: Mirror[] | null = null;
  private readonly away = new THREE.Plane();
  private readonly ghost: THREE.MeshBasicMaterial;
  private readonly ghostInk: THREE.LineBasicMaterial;
  private readonly caps = new Map<THREE.Material, THREE.MeshBasicMaterial>();

  constructor(root: THREE.Object3D, kind: 'procedural' | 'cad') {
    this.variants = new MaterialVariants(kind === 'cad' ? 0.3 : 0.13);
    this.ink = addInk(root, kind);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) this.originals.set(m, m.material as THREE.Material);
    });
    this.ghost = new THREE.MeshBasicMaterial({ color: '#9aa1aa', transparent: true, opacity: 0.08, depthWrite: false, clippingPlanes: [this.away] });
    this.ghostInk = new THREE.LineBasicMaterial({ color: '#16181b', transparent: true, opacity: 0.14, depthWrite: false, clippingPlanes: [this.away] });
    this.section.visible = false;
  }

  get plane(): THREE.Plane {
    return this.variants.plane;
  }

  apply(cut: Cut, isolate: string | null, look: Look = 'studio'): void {
    const all = new Set<THREE.Material>();
    const shown = new Map<THREE.Mesh, { material: THREE.Material; inFocus: boolean }>();
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
      shown.set(mesh, { material, inFocus });
    }
    for (const line of this.ink) all.add(line.material as THREE.Material);
    this.variants.clip(all, cut === 'section');
    for (const line of this.ink) {
      line.visible = !isolate || moduleOf(line) === isolate;
      (line.material as THREE.LineBasicMaterial).opacity = INK_OPACITY[look];
    }
    this.section.visible = cut === 'section';
    if (cut !== 'section') return;
    for (const m of this.mirror()) {
      const now = m.source instanceof THREE.Mesh ? shown.get(m.source) : undefined;
      m.inFocus = now ? now.inFocus : !isolate || moduleOf(m.source) === isolate;
      if (m.cap && now) m.cap.material = this.capOf(now.material);
    }
  }

  /** Cut at `plane`, keeping its positive side; call each frame in section, after the robot is posed. */
  cutAt(plane: THREE.Plane): void {
    this.variants.plane.copy(plane);
    this.away.copy(plane).negate();
    for (const m of this.mirrors ?? []) {
      const on = m.inFocus && !hidden(m.source);
      for (const c of m.copies) {
        c.visible = on;
        if (!on) continue;
        c.matrix.copy(m.source.matrixWorld);
        c.matrixWorldNeedsUpdate = true;
      }
    }
  }

  /** Built the first time section is shown: most robots are never cut. */
  private mirror(): Mirror[] {
    if (this.mirrors) return this.mirrors;
    this.mirrors = [];
    for (const [mesh, original] of this.originals) {
      const layer = partOf(mesh)?.layer;
      if (!layer || layer === 'kinematic' || (mesh as THREE.InstancedMesh).isInstancedMesh) continue;
      const ghost = new THREE.Mesh(mesh.geometry, this.ghost);
      // A double-sided part already draws its inside; a cap there would z-fight it.
      const cap = original.side === THREE.DoubleSide ? null : new THREE.Mesh(mesh.geometry, this.capOf(original));
      this.mirrors.push({ source: mesh, copies: cap ? [ghost, cap] : [ghost], cap, inFocus: true });
    }
    for (const line of this.ink) this.mirrors.push({ source: line, copies: [new THREE.LineSegments(line.geometry, this.ghostInk)], cap: null, inFocus: true });
    for (const m of this.mirrors) {
      for (const c of m.copies) {
        c.matrixAutoUpdate = false;
        c.raycast = () => {};
        this.section.add(c);
      }
    }
    return this.mirrors;
  }

  /** Unlit and a shade darker than the part, so the cut face reads as a face and not a hole. */
  private capOf(m: THREE.Material): THREE.MeshBasicMaterial {
    let cap = this.caps.get(m);
    if (!cap) {
      const color = (m as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color('#b8bcc2');
      cap = new THREE.MeshBasicMaterial({ color: color.multiplyScalar(0.8), side: THREE.BackSide, clippingPlanes: [this.variants.plane] });
      this.caps.set(m, cap);
    }
    return cap;
  }

  dispose(): void {
    for (const line of this.ink) {
      line.removeFromParent();
      line.geometry.dispose();
    }
    for (const [mesh, original] of this.originals) mesh.material = original;
    this.section.removeFromParent();
    this.section.clear();
    for (const cap of this.caps.values()) cap.dispose();
    this.ghost.dispose();
    this.ghostInk.dispose();
    this.variants.dispose();
    this.looks.dispose();
  }
}
