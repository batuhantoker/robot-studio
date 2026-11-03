/** three.js geometry for compiled MuJoCo geoms (meshes come from mesh_vert, never raw files). */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GeomInfo, MeshBuffers } from '../../../physics/extract/geoms';
import { GEOM } from '../../../physics/runtime/arrays';

export function meshGeometry(mesh: MeshBuffers): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.faces, 1));
  // toCreasedNormals welds on a 1/100-unit grid, 1 cm in metres: weld in millimetres instead.
  return toCreasedNormals(g.scale(1000, 1000, 1000), Math.PI / 6).scale(0.001, 0.001, 0.001);
}

/** Primitive geoms; MuJoCo sizes are half-extents/radii, cylinders and capsules along local Z. */
export function primitiveGeometry(geom: GeomInfo): THREE.BufferGeometry | null {
  const [a, b, c] = geom.size;
  switch (geom.type) {
    case GEOM.sphere: return new THREE.SphereGeometry(a, 32, 20);
    case GEOM.ellipsoid: return new THREE.SphereGeometry(1, 32, 20).scale(a, b, c);
    case GEOM.box: return new THREE.BoxGeometry(2 * a, 2 * b, 2 * c);
    case GEOM.cylinder: return new THREE.CylinderGeometry(a, a, 2 * b, 32).rotateX(Math.PI / 2);
    case GEOM.capsule: return new THREE.CapsuleGeometry(a, 2 * b, 8, 24).rotateX(Math.PI / 2);
    default: return null;
  }
}
