/** Fixed half of a rotary actuator: housing, windings, rear bearing, encoder head, driver board. */
import * as THREE from 'three';
import { boltCircle, ringOf } from '../../../common/fasteners';
import { finnedShell, hollowCylinder, lathe, solidCylinder } from '../../../common/lathe';
import { part } from '../../../common/part';
import type { MaterialSet } from '../../../materials/library';

const up = (y: number) => new THREE.Vector3(0, y, 0);

/** `shell` false leaves only the internals, for a casting that is its own housing. */
export function buildStator(mats: MaterialSet, R: number, L: number, shell = true): THREE.Group {
  const g = new THREE.Group();
  if (shell) g.add(
    part(lathe(finnedShell(R, R * 0.09, -0.42 * L, 0.12 * L, 3)), mats, 'shell', { label: 'Housing', layer: 'housing', explode: up(-0.6 * L) }),
    part(lathe(solidCylinder(R * 0.93, -0.5 * L, -0.42 * L, R * 0.05)), mats, 'cap', { label: 'Rear cap', layer: 'housing', explode: up(-1.15 * L) }),
    boltCircle(mats, 6, R * 0.72, R * 0.07, -0.5 * L, -1, { label: 'Cap screws', layer: 'fastener', explode: up(-1.5 * L) }),
  );
  g.add(
    part(lathe(hollowCylinder(R * 0.82, R * 0.66, -0.36 * L, 0.06 * L, R * 0.02)), mats, 'magnet', { label: 'Stator core', layer: 'drive', explode: up(-0.25 * L) }),
    ringOf(new THREE.BoxGeometry(R * 0.12, L * 0.36, R * 0.16), mats.get('copper'), 12, R * 0.59, -0.15 * L, { label: 'Stator windings', layer: 'drive', explode: up(-0.35 * L) }),
    part(new THREE.TorusGeometry(R * 0.27, R * 0.05, 12, 40).rotateX(Math.PI / 2).translate(0, -0.34 * L, 0), mats, 'steel', { label: 'Rear bearing', layer: 'bearing', explode: up(-0.8 * L) }),
    part(new THREE.BoxGeometry(R * 0.14, L * 0.05, R * 0.1).translate(R * 0.42, -0.385 * L, 0), mats, 'pcb', { label: 'Encoder read head', layer: 'sensor', explode: up(-0.95 * L) }),
    part(lathe(solidCylinder(R * 0.74, -0.415 * L, -0.4 * L), 32), mats, 'pcb', { label: 'Driver board', layer: 'sensor', explode: up(-1.0 * L) }),
  );
  return g;
}

/** The status ring between stator and rotor: it glows with joint load. */
export function buildLoadRing(mats: MaterialSet, R: number, L: number): THREE.Mesh {
  const ring = part(new THREE.TorusGeometry(R * 0.985, R * 0.03, 10, 64).rotateX(Math.PI / 2).translate(0, 0.14 * L, 0), mats, 'accent', { label: 'Load ring', layer: 'sensor' });
  ring.material = mats.get('accent').clone();
  return ring;
}
