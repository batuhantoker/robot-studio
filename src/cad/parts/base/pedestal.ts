/** Floor plate and column carrying the first joint module. */
import * as THREE from 'three';
import { boltCircle } from '../../common/fasteners';
import { hollowCylinder, lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import type { MaterialSet } from '../../materials/library';

/** Everything in world Z-up coordinates; the column runs from the floor to `top`. */
export function buildPedestal(mats: MaterialSet, base: THREE.Vector3, floorZ: number, top: number, R: number): THREE.Group {
  const g = new THREE.Group();
  const toZ = (geom: THREE.BufferGeometry) => geom.rotateX(Math.PI / 2);
  const down = (z: number) => new THREE.Vector3(0, 0, z);
  const plate = R * 0.22;
  const height = Math.max(top - floorZ - plate, 0);
  g.add(
    part(toZ(lathe(solidCylinder(R * 1.9, 0, plate, R * 0.06), 64)), mats, 'cap', { label: 'Floor plate', layer: 'structure', explode: down(-R * 1.4) }),
  );
  const bolts = boltCircle(mats, 8, R * 1.55, R * 0.1, plate, 1, { label: 'Anchor bolts', layer: 'fastener', explode: down(R * 0.8) });
  bolts.rotation.x = Math.PI / 2;
  g.add(bolts);
  if (height > R * 0.05) {
    const col = toZ(lathe(hollowCylinder(R * 1.08, R * 0.9, plate, plate + height, R * 0.05), 56));
    g.add(part(col, mats, 'shell', { label: 'Column', layer: 'housing', explode: down(-R * 0.7) }));
  }
  g.position.set(base.x, base.y, floorZ);
  return g;
}
