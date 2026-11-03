/** Universal (Cardan) joint: parent yoke, cross spider on DOF a, child yoke on DOF b. */
import * as THREE from 'three';
import { v3 } from '../../../common/orient';
import { part } from '../../../common/part';
import { block, pin } from '../../shapes/blocks';
import { type JointModuleBuilder, moduleRadius } from '../../types';

/** Local basis: X = pin a, Y = pin b, Z = a × b (the shaft line at zero pose). */
function basis(a: THREE.Vector3, b: THREE.Vector3) {
  const g = new THREE.Group();
  const c = new THREE.Vector3().crossVectors(a, b);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, b, c));
  return g;
}

export const universalModule: JointModuleBuilder = ({ mats, link }) => {
  const s = moduleRadius(link) * 0.75;
  const [a, b] = [v3(link.dofs[0].axis), v3(link.axis2)];
  const out = (z: number) => new THREE.Vector3(0, 0, z);
  const yokeA = basis(a, b);
  yokeA.add(
    part(pin(s * 1.1, s * 0.5, 'z').translate(0, 0, -s * 1.9), mats, 'alu', { label: 'Parent hub', layer: 'structure', explode: out(-s * 1.5) }),
    part(block(s * 0.45, s * 0.9, s * 2.1).translate(s * 1.15, 0, -s * 0.85), mats, 'alu', { label: 'Yoke arm', layer: 'structure', explode: out(-s * 1.5) }),
    part(block(s * 0.45, s * 0.9, s * 2.1).translate(-s * 1.15, 0, -s * 0.85), mats, 'alu', { label: 'Yoke arm', layer: 'structure', explode: out(-s * 1.5) }),
  );
  const ring = part(pin(s * 0.34, s * 0.62, 'z'), mats, 'accent', { label: 'Spider hub', layer: 'sensor' });
  ring.material = mats.get('accent').clone();
  const spider = basis(a, b);
  spider.add(
    part(pin(s * 0.24, s * 2.6, 'x'), mats, 'steel', { label: 'Cross pin a', layer: 'drive' }),
    part(pin(s * 0.24, s * 2.6, 'y'), mats, 'steel', { label: 'Cross pin b', layer: 'drive' }),
    ...[-1, 1].map((k) => part(pin(s * 0.36, s * 0.3, 'x').translate(k * s * 1.15, 0, 0), mats, 'cap', { label: 'Needle-bearing cup', layer: 'bearing', explode: new THREE.Vector3(k * s, 0, 0) })),
    ...[-1, 1].map((k) => part(pin(s * 0.36, s * 0.3, 'y').translate(0, k * s * 1.15, 0), mats, 'cap', { label: 'Needle-bearing cup', layer: 'bearing', explode: new THREE.Vector3(0, k * s, 0) })),
    ring,
  );
  const yokeB = basis(a, b);
  yokeB.add(
    part(pin(s * 1.1, s * 0.5, 'z').translate(0, 0, s * 1.9), mats, 'alu', { label: 'Child hub', layer: 'structure', explode: out(s * 1.5) }),
    ...[-1, 1].map((k) => part(block(s * 0.9, s * 0.45, s * 2.1).translate(0, k * s * 1.15, s * 0.85), mats, 'alu', { label: 'Yoke arm', layer: 'structure', explode: out(s * 1.5) })),
  );
  const stages = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  stages[0].add(yokeA);
  stages[1].add(spider);
  stages[2].add(yokeB);
  return { stages, exit: () => s * 2.1, indicators: [ring, ring], size: s * 4 };
};
