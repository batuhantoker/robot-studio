/** The side envelope drawn on a vertical plane through the base that turns to face the camera. */
import * as THREE from 'three';
import type { SideEnvelope } from '../../core/analysis/workspace/envelope';
import { envelopeOutline } from '../../core/analysis/workspace/envelope';
import type { Vec3 } from '../../core/math/linear/vec';
import { PALETTE } from '../stage/palette';

function fillTexture(e: SideEnvelope): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2 * e.nr;
  canvas.height = e.nz;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(61,143,224,0.16)';
  for (let z = 0; z < e.nz; z++) {
    for (let r = 0; r < e.nr; r++) {
      if (!e.filled[z * e.nr + r]) continue;
      g.fillRect(e.nr + r, e.nz - 1 - z, 1, 1);
      g.fillRect(e.nr - 1 - r, e.nz - 1 - z, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function envelopeObject(e: SideEnvelope, axis: Vec3): THREE.Group {
  const group = new THREE.Group();
  group.position.set(axis[0], axis[1], 0);
  const w = 2 * e.nr * e.cell, hgt = e.nz * e.cell;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, hgt).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: fillTexture(e), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  plane.position.z = e.z0 + hgt / 2;
  const segs = envelopeOutline(e).flatMap(([a, b, c, d]) => [a, 0, b, c, 0, d]);
  const outline = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(segs, 3)),
    new THREE.LineBasicMaterial({ color: PALETTE.blue, transparent: true, opacity: 0.9 }),
  );
  plane.raycast = outline.raycast = () => {};
  group.add(plane, outline);
  return group;
}

/** Turn the envelope plane (local XZ) to face the camera about the base's vertical axis. */
export function faceCamera(group: THREE.Object3D, camera: THREE.Camera): void {
  const dx = camera.position.x - group.position.x, dy = camera.position.y - group.position.y;
  group.rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
}
