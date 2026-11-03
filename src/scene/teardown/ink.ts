/** Ink outlines on creased edges so pale parts read against the light studio. */
import * as THREE from 'three';
import { partOf } from '../../cad/common/part';

const INK = new THREE.LineBasicMaterial({ color: '#16181b', transparent: true, opacity: 0.28 });

/** Procedural parts are clean; scanned/decimated CAD needs a sharper crease and a smaller budget. */
const POLICY = {
  procedural: { angle: 35, maxTriangles: 90_000 },
  cad: { angle: 55, maxTriangles: 30_000 },
};

export function addInk(root: THREE.Object3D, kind: keyof typeof POLICY = 'procedural'): THREE.LineSegments[] {
  const { angle, maxTriangles } = POLICY[kind];
  const lines: THREE.LineSegments[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const layer = partOf(m)?.layer;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && layer && layer !== 'kinematic' && layer !== 'cable') meshes.push(m);
  });
  for (const mesh of meshes) {
    const tris = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    if (tris > maxTriangles) continue;
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, angle), INK);
    line.raycast = () => {};
    mesh.add(line);
    lines.push(line);
  }
  return lines;
}
