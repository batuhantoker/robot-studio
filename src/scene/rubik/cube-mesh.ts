/** A 57 mm speed cube like Dactyl's: 26 rounded black pieces with inset stickers, and one layer that can be mid-turn. */
import * as THREE from 'three';
import { block } from '../../cad/parts/shapes/blocks';
import { FACE_NORMALS, type Mat3, type Piece, inLayer, mul, rotation } from '../../core/rubik/pieces';

export const CUBE_SIZE = 0.057;
const PITCH = CUBE_SIZE / 3;

/** U R F D L B in the standard Western scheme. */
const STICKER = ['#f3f3ee', '#c8102e', '#009b48', '#ffd500', '#ff5800', '#0046ad'];

const matrix4 = (m: Mat3, p: THREE.Vector3 = new THREE.Vector3()) =>
  new THREE.Matrix4().set(m[0], m[1], m[2], p.x, m[3], m[4], m[5], p.y, m[6], m[7], m[8], p.z, 0, 0, 0, 1);

export interface CubeView {
  pieces: Piece[];
  /** A layer part-way through a turn: its face and the angle turned so far (radians, about the outward normal). */
  turning: { face: number; angle: number } | null;
}

export class CubeMesh {
  readonly group = new THREE.Group();
  private readonly cubies: THREE.Group[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor() {
    const body = block(PITCH * 0.985, PITCH * 0.985, PITCH * 0.985, PITCH * 0.14);
    const tile = block(PITCH * 0.8, PITCH * 0.8, PITCH * 0.06, PITCH * 0.12);
    const plastic = new THREE.MeshPhysicalMaterial({ color: '#141516', roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5 });
    const paints = STICKER.map((color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
    this.geometries.push(body, tile);
    this.materials.push(plastic, ...paints);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      const core = new THREE.Mesh(body, plastic);
      core.position.set(x, y, z).multiplyScalar(PITCH);
      g.add(core);
      FACE_NORMALS.forEach((n, face) => {
        if (n[0] * x + n[1] * y + n[2] * z !== 1) return;
        const s = new THREE.Mesh(tile, paints[face]);
        const normal = new THREE.Vector3(...n);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        s.position.copy(core.position).addScaledVector(normal, PITCH * 0.49);
        g.add(s);
      });
      g.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
      this.cubies.push(g);
      this.group.add(g);
    }
  }

  /** Pieces in solvedPieces() order, which is the order the cubies were built in. */
  show(view: CubeView): void {
    const t = view.turning;
    const turn = t ? rotation(FACE_NORMALS[t.face], t.angle) : null;
    view.pieces.forEach((p, i) => {
      const R = turn && inLayer(p, t!.face) ? mul(turn, p.R) : p.R;
      const g = this.cubies[i];
      g.matrix.copy(matrix4(R));
      g.matrixWorldNeedsUpdate = true;
    });
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
