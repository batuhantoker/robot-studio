/** Planar joint: an XY stage (two slides in the plane) with a rotary table about the normal. */
import * as THREE from 'three';
import { boltCircle } from '../../../common/fasteners';
import { lathe, solidCylinder } from '../../../common/lathe';
import { hullBox, hullPin } from '../../../common/hull';
import { v3 } from '../../../common/orient';
import { part } from '../../../common/part';
import { block } from '../../shapes/blocks';
import { type JointModuleBuilder, moduleRadius } from '../../types';

/** Local basis: X = u slide, Y = v slide, Z = plane normal. */
function basis(u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3) {
  const g = new THREE.Group();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
  return g;
}

export const planarModule: JointModuleBuilder = ({ mats, link }) => {
  const s = moduleRadius(link) * 0.7;
  const [du, dv] = link.dofs;
  const [u, v, n] = [v3(du.axis), v3(dv.axis), v3(link.axis)];
  const span = (d: typeof du) => d.limits[1] - d.limits[0];
  const mid = (d: typeof du) => (d.limits[0] + d.limits[1]) / 2;
  const [wu, wv] = [span(du) + s * 4, span(dv) + s * 4];
  const drop = (z: number) => new THREE.Vector3(0, 0, z);
  const plate = basis(u, v, n);
  plate.add(
    part(block(wu, wv, s * 0.4).translate(mid(du), mid(dv), -s * 1.5), mats, 'cap', { label: 'Base plate', layer: 'structure', explode: drop(-s * 2.4) }),
    ...[-1, 1].map((k) => part(block(wu * 0.96, s * 0.3, s * 0.3).translate(mid(du), mid(dv) + k * s * 1.4, -s * 1.15), mats, 'steel', { label: 'U rail', layer: 'bearing', explode: drop(-s * 1.6) })),
    hullBox(wu, wv, s * 0.4, new THREE.Vector3(mid(du), mid(dv), -s * 1.5)),
  );
  const saddle = basis(u, v, n);
  saddle.add(
    part(block(s * 3.2, wv * 0.9, s * 0.35).translate(0, mid(dv), -s * 0.82), mats, 'alu', { label: 'U saddle', layer: 'housing', explode: drop(-s * 0.9) }),
    ...[-1, 1].map((k) => part(block(s * 0.3, wv * 0.86, s * 0.25).translate(k * s * 1.1, mid(dv), -s * 0.55), mats, 'steel', { label: 'V rail', layer: 'bearing', explode: drop(-s * 0.5) })),
    hullBox(s * 3.2, wv * 0.9, s * 0.35, new THREE.Vector3(0, mid(dv), -s * 0.82)),
  );
  const carriage = basis(u, v, n);
  carriage.add(
    part(block(s * 2.8, s * 2.8, s * 0.35).translate(0, 0, -s * 0.28), mats, 'shell', { label: 'V carriage', layer: 'housing', explode: drop(s * 0.4) }),
    hullBox(s * 2.8, s * 2.8, s * 0.35, drop(-s * 0.28)),
  );
  const ring = part(new THREE.TorusGeometry(s * 1.22, s * 0.05, 10, 64), mats, 'accent', { label: 'Load ring', layer: 'sensor' });
  ring.material = mats.get('accent').clone();
  ring.position.z = -s * 0.1;
  const table = basis(u, v, n);
  const disc = lathe(solidCylinder(s * 1.2, -s * 0.1, s * 0.1, s * 0.04)).rotateX(Math.PI / 2);
  const bolts = boltCircle(mats, 6, s * 0.85, s * 0.08, 0, 1, { label: 'Table screws', layer: 'fastener', explode: drop(s * 1.6) });
  bolts.rotation.x = Math.PI / 2;
  bolts.position.z = s * 0.1;
  table.add(part(disc, mats, 'alu', { label: 'Rotary table', layer: 'structure', explode: drop(s * 1.1) }), bolts, ring, hullPin(s * 1.2, s * 0.2, 'z'));
  const stages = [plate, saddle, carriage, table].map((g) => new THREE.Group().add(g));
  return { stages, exit: () => s * 1.3, indicators: [ring, ring, ring], size: s * 3 };
};
