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

/** How much nearer the camera this part is cut than the section plane. */
function stepOf(o: THREE.Object3D): number {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (typeof n.userData.cut === 'number') return n.userData.cut;
  return 0;
}

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
  /** By paint and by cut step: bodies sharing a paint can be cut on different planes. */
  private readonly caps = new Map<THREE.Material, Map<number, THREE.MeshBasicMaterial>>();
  private readonly steps = new Map<number, THREE.Plane>();

  constructor(root: THREE.Object3D, kind: 'procedural' | 'cad') {
    this.variants = new MaterialVariants(kind === 'cad' ? 0.3 : 0.13);
    this.ink = addInk(root, kind);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) this.originals.set(m, m.material as THREE.Material);
    });
    this.ghost = new THREE.MeshBasicMaterial({ color: '#9aa1aa', transparent: true, opacity: 0.08, depthWrite: false, clippingPlanes: [this.away] });
    this.section.visible = false;
  }

  get plane(): THREE.Plane {
    return this.variants.plane;
  }

  /** Some parts are cut on planes of their own, which an override material cannot follow. */
  get stepped(): boolean {
    return this.steps.size > 0;
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
      const step = cut === 'section' ? stepOf(mesh) : 0;
      if (step) material = this.variants.steppedOf(material, this.stepPlane(step));
      mesh.material = material;
      mesh.castShadow = inFocus && material.opacity >= 1;
      if (meta?.layer === 'kinematic') mesh.visible = cut === 'glass';
      if (!step) all.add(material);
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
      // The inside of a casting closes in the colour of its wall, or the cut face would come out patched.
      const like = shown.get((m.source.userData.capAs as THREE.Mesh | undefined) ?? (m.source as THREE.Mesh));
      if (m.cap && now) m.cap.material = this.capOf((like ?? now).material, stepOf(m.source));
    }
  }

  /** Cut at `plane`, keeping its positive side; call each frame in section, after the robot is posed. */
  cutAt(plane: THREE.Plane): void {
    this.variants.plane.copy(plane);
    this.away.copy(plane).negate();
    for (const [step, p] of this.steps) {
      p.copy(plane);
      p.constant += step;
    }
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
      if (!layer || layer === 'kinematic') continue;
      const many = mesh as THREE.InstancedMesh;
      if (many.isInstancedMesh) {
        // Cut open and uncapped, windings look empty straight on and show only their inner walls at an angle.
        const closed = new THREE.InstancedMesh(mesh.geometry, this.capOf(original, stepOf(mesh)), many.count);
        closed.instanceMatrix = many.instanceMatrix;
        closed.frustumCulled = false;
        this.mirrors.push({ source: mesh, copies: [closed], cap: closed, inFocus: true });
        continue;
      }
      // The removed half keeps only its outline: ghosts of every drive part behind the cut read as clutter.
      const ghost = layer === 'housing' ? new THREE.Mesh(mesh.geometry, this.ghost) : null;
      // A double-sided part already draws its inside; a cap there would z-fight it.
      const cap = original.side === THREE.DoubleSide ? null : new THREE.Mesh(mesh.geometry, this.capOf(original, stepOf(mesh)));
      const copies = [ghost, cap].filter((c) => c !== null);
      if (copies.length) this.mirrors.push({ source: mesh, copies, cap, inFocus: true });
    }
    for (const m of this.mirrors) {
      for (const c of m.copies) {
        c.matrixAutoUpdate = false;
        c.raycast = () => {};
        this.section.add(c);
      }
    }
    return this.mirrors;
  }

  private stepPlane(step: number): THREE.Plane {
    let p = this.steps.get(step);
    if (!p) this.steps.set(step, (p = new THREE.Plane()));
    return p;
  }

  /** Unlit, so the cut face reads as a face and not a hole against the dark inside of the casting. */
  private capOf(m: THREE.Material, step = 0): THREE.MeshBasicMaterial {
    const byStep = this.caps.get(m) ?? new Map<number, THREE.MeshBasicMaterial>();
    this.caps.set(m, byStep);
    let cap = byStep.get(step);
    if (!cap) {
      const color = (m as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color('#b8bcc2');
      // A mid tone: it has to read against the pale stage behind a part and the dark inside of a casting alike.
      cap = new THREE.MeshBasicMaterial({ color: color.multiplyScalar(0.68), side: THREE.BackSide, clippingPlanes: [step ? this.stepPlane(step) : this.variants.plane] });
      byStep.set(step, cap);
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
    for (const byStep of this.caps.values()) for (const cap of byStep.values()) cap.dispose();
    this.ghost.dispose();
    this.variants.dispose();
    this.looks.dispose();
  }
}
