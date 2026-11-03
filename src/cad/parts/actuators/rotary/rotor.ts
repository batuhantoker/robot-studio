/** Moving half of a rotary actuator: shaft, magnets, encoder disc, strain-wave gear, output flange. */
import * as THREE from 'three';
import { boltCircle, ringOf } from '../../../common/fasteners';
import { hollowCylinder, lathe, solidCylinder } from '../../../common/lathe';
import { part } from '../../../common/part';
import type { MaterialSet } from '../../../materials/library';

const up = (y: number) => new THREE.Vector3(0, y, 0);

function flexspline(R: number, L: number) {
  const [r, w, y0, y1] = [R * 0.62, R * 0.05, 0.17 * L, 0.4 * L];
  return lathe([[R * 0.16, y0], [r, y0], [r, y1], [r - w, y1], [r - w, y0 + w], [R * 0.16, y0 + w]]);
}

export function buildRotor(mats: MaterialSet, R: number, L: number): THREE.Group {
  const g = new THREE.Group();
  g.add(
    part(new THREE.CylinderGeometry(R * 0.12, R * 0.12, 0.9 * L, 24).translate(0, 0.05 * L, 0), mats, 'steel', { label: 'Shaft', layer: 'drive', explode: up(0.3 * L) }),
    part(lathe(hollowCylinder(R * 0.5, R * 0.2, -0.3 * L, 0.05 * L, R * 0.02)), mats, 'magnet', { label: 'Magnet rotor', layer: 'drive', explode: up(0.12 * L) }),
    ringOf(new THREE.BoxGeometry(R * 0.06, L * 0.3, R * 0.2), mats.get('copper'), 10, R * 0.5, -0.12 * L, { label: 'Rotor magnets', layer: 'drive', explode: up(0.12 * L) }),
    part(lathe(solidCylinder(R * 0.4, -0.375 * L, -0.36 * L), 40), mats, 'brass', { label: 'Encoder disc', layer: 'sensor', explode: up(-0.62 * L) }),
    ringOf(new THREE.BoxGeometry(R * 0.012, L * 0.02, R * 0.07), mats.get('cap'), 48, R * 0.33, -0.36 * L, { label: 'Encoder track', layer: 'sensor', explode: up(-0.62 * L) }),
    part(flexspline(R, L), mats, 'steel', { label: 'Strain-wave gear', layer: 'drive', explode: up(0.6 * L) }),
    part(new THREE.TorusGeometry(R * 0.71, R * 0.055, 12, 56).rotateX(Math.PI / 2).translate(0, 0.19 * L, 0), mats, 'steel', { label: 'Cross-roller bearing', layer: 'bearing', explode: up(0.82 * L) }),
    part(lathe(hollowCylinder(R * 0.97, R * 0.86, 0.16 * L, 0.42 * L, R * 0.04)), mats, 'shell', { label: 'Output housing', layer: 'housing', explode: up(0.95 * L) }),
    part(lathe(solidCylinder(R * 0.84, 0.42 * L, 0.5 * L, R * 0.04)), mats, 'alu', { label: 'Output flange', layer: 'structure', explode: up(1.2 * L) }),
    boltCircle(mats, 8, R * 0.64, R * 0.06, 0.5 * L, 1, { label: 'Flange screws', layer: 'fastener', explode: up(1.55 * L) }),
  );
  return g;
}
