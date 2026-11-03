/** Revolved profiles (axis = local +Y) with creased normals so machined edges stay crisp. */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export type Profile = [number, number][];

export function lathe(profile: Profile, segments = 48): THREE.BufferGeometry {
  const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  return toCreasedNormals(new THREE.LatheGeometry(points, segments), Math.PI / 5);
}

/** Closed profile of a hollow cylinder with chamfered outer edges. */
export function hollowCylinder(outer: number, inner: number, y0: number, y1: number, chamfer = 0): Profile {
  const c = Math.min(chamfer, (y1 - y0) / 3, (outer - inner) / 2);
  return [
    [inner, y0], [outer - c, y0], [outer, y0 + c], [outer, y1 - c], [outer - c, y1], [inner, y1], [inner, y0],
  ];
}

/** Solid disc/cylinder with chamfers, closed through the axis. */
export function solidCylinder(radius: number, y0: number, y1: number, chamfer = 0): Profile {
  const c = Math.min(chamfer, (y1 - y0) / 3, radius / 3);
  return [[0, y0], [radius - c, y0], [radius, y0 + c], [radius, y1 - c], [radius - c, y1], [0, y1]];
}

/** Outer wall with shallow cooling grooves, then the bore, closed. */
export function finnedShell(R: number, wall: number, y0: number, y1: number, fins: number): Profile {
  const c = Math.min(R * 0.08, (y1 - y0) / 6);
  const p: Profile = [[R - wall, y0], [R - c, y0], [R, y0 + c]];
  const span = y1 - y0 - 4 * c;
  const depth = R * 0.05;
  for (let i = 0; i < fins; i++) {
    const a = y0 + 2 * c + (span * (i + 0.35)) / fins;
    const b = a + (span * 0.3) / fins;
    p.push([R, a], [R - depth, a + depth * 0.4], [R - depth, b - depth * 0.4], [R, b]);
  }
  p.push([R, y1 - c], [R - c, y1], [R - wall, y1], [R - wall, y0]);
  return p;
}
