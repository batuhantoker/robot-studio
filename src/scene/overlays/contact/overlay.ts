/** Ground contact: a red halo around every footprint where the robot meets the floor. */
import * as THREE from 'three';
import type { Solid } from '../../../cad/common/lowest';
import { type P2, offsetPolygon, roundedHull } from '../../../core/math/planar/hull';
import { PALETTE } from '../../stage/palette';
import { contactPatches } from './patches';

class Triangles {
  readonly mesh: THREE.Mesh;
  private positions = new Float32Array(3 * 256);
  private readonly geometry = new THREE.BufferGeometry();

  constructor(opacity: number) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({
      color: PALETTE.accent, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    // After the shadow-catching floor, which is transparent too.
    this.mesh.renderOrder = 2;
  }

  set(values: number[]): void {
    if (values.length > this.positions.length) {
      this.positions = new Float32Array(Math.max(values.length, this.positions.length * 2));
      this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    }
    this.positions.set(values);
    this.geometry.setDrawRange(0, values.length / 3);
    this.geometry.attributes.position.needsUpdate = true;
  }
}

function fan(out: number[], poly: P2[], z: number): void {
  for (let i = 1; i + 1 < poly.length; i++) out.push(...poly[0], z, ...poly[i], z, ...poly[i + 1], z);
}

function band(out: number[], inner: P2[], outer: P2[], z: number): void {
  for (let i = 0; i < inner.length; i++) {
    const k = (i + 1) % inner.length;
    out.push(...inner[i], z, ...outer[i], z, ...outer[k], z, ...inner[i], z, ...outer[k], z, ...inner[k], z);
  }
}

export class GroundContactOverlay {
  readonly group = new THREE.Group();
  private readonly fill = new Triangles(0.22);
  private readonly ring = new Triangles(0.85);

  constructor() {
    this.group.add(this.fill.mesh, this.ring.mesh);
  }

  /** Solids and floor in the holder's frame; `scale` is the robot's bounding radius. */
  update(list: Solid[], floor: number, scale: number): void {
    const patches = contactPatches(list, floor, Math.max(0.001, scale * 0.004), scale * 0.01);
    const fill: number[] = [], ring: number[] = [];
    const z = floor + scale * 0.0005;
    for (const points of patches) {
      const inner = roundedHull(points, scale * 0.004);
      fan(fill, inner, z);
      band(ring, inner, offsetPolygon(inner, scale * 0.012), z);
    }
    this.fill.set(fill);
    this.ring.set(ring);
  }
}
