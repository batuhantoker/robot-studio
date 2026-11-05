/** The thing a hand holds in a grip, drawn in the shape the fingers were measured against. */
import * as THREE from 'three';
import { setFromTransform } from '../../cad/common/orient';
import type { Transform } from '../../core/math/linear/transform';
import type { HeldShape } from '../../core/prosthesis/held';
import { PALETTE } from '../stage/palette';

const paint = (color: string, roughness: number, metalness = 0) => new THREE.MeshPhysicalMaterial({ color, roughness, metalness });

/** Along z, like the shape it draws. */
const rod = (radius: number, length: number, segments = 64) => new THREE.CylinderGeometry(radius, radius, length, segments).rotateX(Math.PI / 2);

/** A drinks can: straight walls for the fingers, a neck and rim drawn inside the shape they were measured against. */
function can(r: number, l: number): THREE.BufferGeometry {
  const h = l / 2, neck = h - l * 0.07;
  const profile = [[0, -h], [r * 0.8, -h], [r * 0.86, -h + 0.0012], [r, -neck], [r, neck], [r * 0.84, h - 0.0018], [r * 0.86, h - 0.0004], [r * 0.82, h], [r * 0.78, h - 0.002], [0, h - 0.002]];
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 72).rotateX(Math.PI / 2);
}

/** A bow with a hole, then a blade with its cuts, flat on z, the blade along +y. */
function key(s: Extract<HeldShape, { kind: 'key' }>): THREE.BufferGeometry {
  const [length, width] = s.blade, w = width / 2, y0 = -length / 2, y1 = length / 2, cy = y0 - s.bow * 0.8;
  const out = new THREE.Shape();
  out.moveTo(-w, y0);
  out.absarc(0, cy, s.bow, Math.PI * 0.62, Math.PI * 0.38, false);
  out.lineTo(w, y0);
  out.lineTo(w, y1 - width * 0.6);
  out.lineTo(0, y1);
  let y = y1 - width * 0.9;
  out.lineTo(-w, y);
  for (const d of [0.3, 0.55, 0.25, 0.5, 0.35]) {
    out.lineTo(-w + width * d, y - 0.0015);
    out.lineTo(-w, y - 0.003);
    y -= 0.004;
  }
  out.lineTo(-w, y0);
  const hole = new THREE.Path();
  hole.absarc(0, cy - s.bow * 0.45, s.bow * 0.28, 0, Math.PI * 2, true);
  out.holes.push(hole);
  return new THREE.ExtrudeGeometry(out, { depth: s.thick, bevelEnabled: false, curveSegments: 32 }).translate(0, 0, -s.thick / 2);
}

function meshes(s: HeldShape): THREE.Mesh[] {
  switch (s.kind) {
    case 'cylinder': {
      const r = s.radius, l = s.length;
      const band = new THREE.CylinderGeometry(r + 1e-4, r + 1e-4, l * 0.56, 72, 1, true).rotateX(Math.PI / 2);
      return [new THREE.Mesh(can(r, l), paint('#d3d7dc', 0.26, 0.92)), new THREE.Mesh(band, paint(PALETTE.accent, 0.42))];
    }
    case 'ball':
      return [new THREE.Mesh(new THREE.SphereGeometry(s.radius, 64, 40), paint(PALETTE.accent, 0.55))];
    case 'bar': {
      const cap = (z: number) => rod(s.radius * 1.28, 0.006).translate(0, 0, z);
      return [new THREE.Mesh(rod(s.radius, s.length), paint('#d3d7dc', 0.32, 0.9)), new THREE.Mesh(cap(s.length / 2), paint('#2a2d33', 0.5)), new THREE.Mesh(cap(-s.length / 2), paint('#2a2d33', 0.5))];
    }
    case 'pin': {
      const head = rod(s.radius * 1.5, 0.006, 6).translate(0, 0, s.length / 2 - 0.003);
      return [new THREE.Mesh(rod(s.radius, s.length), paint('#c9a23c', 0.3, 0.85)), new THREE.Mesh(head, paint('#c9a23c', 0.3, 0.85))];
    }
    case 'key':
      return [new THREE.Mesh(key(s), paint('#c9a23c', 0.28, 0.9))];
  }
}

export class HeldObject {
  readonly group = new THREE.Group();
  private shown: HeldShape | null = null;

  set(shape: HeldShape | null): void {
    if (shape === this.shown) return;
    this.clear();
    this.shown = shape;
    for (const m of shape ? meshes(shape) : []) {
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
  }

  place(pose: Transform): void {
    setFromTransform(this.group, pose);
  }

  clear(): void {
    for (const m of this.group.children as THREE.Mesh[]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.group.clear();
    this.shown = null;
  }
}
