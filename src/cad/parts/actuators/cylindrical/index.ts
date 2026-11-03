/** Cylindrical joint: telescoping sleeve (slide) topped by a rotary collar (turn), one axis. */
import * as THREE from 'three';
import { boltCircle } from '../../../common/fasteners';
import { hollowCylinder, lathe, solidCylinder } from '../../../common/lathe';
import { axisFrame, cylinderExit, v3 } from '../../../common/orient';
import { part } from '../../../common/part';
import { type JointModuleBuilder, moduleRadius } from '../../types';

export const cylindricalModule: JointModuleBuilder = ({ mats, link }) => {
  const R = moduleRadius(link);
  const [lo, hi] = link.dofs[0].limits;
  const axis = v3(link.dofs[0].axis);
  const up = (y: number) => new THREE.Vector3(0, y, 0);
  const bottom = 2 * lo - hi - R;
  const sleeve = axisFrame(axis);
  sleeve.add(
    part(lathe(hollowCylinder(R * 0.95, R * 0.72, bottom, -R * 0.1, R * 0.06)), mats, 'shell', { label: 'Outer sleeve', layer: 'housing', explode: up(-R * 1.2) }),
    part(lathe(solidCylinder(R * 1.25, bottom - R * 0.2, bottom, R * 0.05)), mats, 'cap', { label: 'Base flange', layer: 'structure', explode: up(-R * 1.8) }),
    part(lathe(hollowCylinder(R * 0.75, R * 0.66, -R * 0.6, -R * 0.1)), mats, 'brass', { label: 'Guide bushing', layer: 'bearing', explode: up(R * 0.6) }),
  );
  const tube = axisFrame(axis);
  tube.add(part(lathe(hollowCylinder(R * 0.64, R * 0.5, -(hi - lo) - R * 0.8, R * 0.25, R * 0.03)), mats, 'alu', { label: 'Telescoping tube', layer: 'structure', explode: up(R * 0.9) }));
  const ring = part(lathe(hollowCylinder(R * 1.01, R * 0.95, R * 0.28, R * 0.36), 64), mats, 'accent', { label: 'Load ring', layer: 'sensor' });
  ring.material = mats.get('accent').clone();
  const collar = axisFrame(axis);
  collar.add(
    part(lathe(hollowCylinder(R, R * 0.3, R * 0.25, R * 0.85, R * 0.08)), mats, 'shell', { label: 'Rotary collar', layer: 'housing', explode: up(R * 1.4) }),
    part(new THREE.TorusGeometry(R * 0.55, R * 0.06, 12, 48).rotateX(Math.PI / 2).translate(0, R * 0.33, 0), mats, 'steel', { label: 'Collar bearing', layer: 'bearing', explode: up(R * 1.1) }),
    part(lathe(solidCylinder(R * 0.85, R * 0.85, R * 0.95, R * 0.03)), mats, 'alu', { label: 'Top flange', layer: 'structure', explode: up(R * 1.9) }),
    boltCircle(mats, 6, R * 0.62, R * 0.07, R * 0.95, 1, { label: 'Flange screws', layer: 'fastener', explode: up(R * 2.3) }),
    ring,
  );
  const stages = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  stages[0].add(sleeve);
  stages[1].add(tube);
  stages[2].add(collar);
  return { stages, exit: (dir) => cylinderExit(R, R, axis, dir), indicators: [ring, ring], size: R * 2 };
};
