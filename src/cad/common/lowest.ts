/** Exact lowest points of an assembly's visible solids, for grounding and floor contact. */
import * as THREE from 'three';
import { partOf } from './part';

/** A visible solid mesh with a cheap lower bound on its world z. */
export interface Solid {
  mesh: THREE.Mesh;
  bound: number;
}

const box = new THREE.Box3();
const corner = new THREE.Vector3();

/** Visible solid meshes, lowest bound first; kinematic helpers are not solid, nor instanced meshes, whose template sits at the origin. */
export function solids(root: THREE.Object3D): Solid[] {
  const out: Solid[] = [];
  root.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || partOf(mesh)?.layer === 'kinematic') return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox!);
    let bound = Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      bound = Math.min(bound, corner.applyMatrix4(mesh.matrixWorld).z);
    }
    out.push({ mesh, bound });
  });
  return out.sort((a, b) => a.bound - b.bound);
}

/** Raw vertex positions: x of vertex i at `array[offset + i * stride]`. */
export function vertexArray(mesh: THREE.Mesh): { array: ArrayLike<number>; stride: number; offset: number; count: number } {
  const p = mesh.geometry.attributes.position as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  return 'isInterleavedBufferAttribute' in p && p.isInterleavedBufferAttribute
    ? { array: p.data.array, stride: p.data.stride, offset: p.offset, count: p.count }
    : { array: p.array, stride: p.itemSize, offset: 0, count: p.count };
}

/** Exact lowest world z of a mesh's vertices. */
export function meshLowest(mesh: THREE.Mesh): number {
  const { array: a, stride, offset, count } = vertexArray(mesh);
  const e = mesh.matrixWorld.elements;
  let min = Infinity;
  for (let i = 0, k = offset; i < count; i++, k += stride) {
    const z = e[2] * a[k] + e[6] * a[k + 1] + e[10] * a[k + 2] + e[14];
    if (z < min) min = z;
  }
  return min;
}

/** Exact lowest world z. Box corners of rotated meshes reach well below the surface, so they only prune. */
export function lowestZ(list: Solid[]): number {
  let min = Infinity;
  for (const s of list) {
    if (s.bound >= min) break;
    min = Math.min(min, meshLowest(s.mesh));
  }
  return min;
}

/** Lowest solid point of an assembly as currently posed (world matrices refreshed first). */
export function lowestSolidZ(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  return lowestZ(solids(root));
}
