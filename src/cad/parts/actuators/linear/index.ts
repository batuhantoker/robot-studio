/** Prismatic joint: ball-screw linear axis. Rail and motor stay; the carriage rides the DOF. */
import * as THREE from 'three';
import { axisFrame, v3 } from '../../../common/orient';
import { part } from '../../../common/part';
import { block, pin } from '../../shapes/blocks';
import { type JointModuleBuilder, moduleRadius } from '../../types';

export const linearModule: JointModuleBuilder = ({ mats, link }) => {
  const r = moduleRadius(link) * 0.6;
  const [lo, hi] = link.dofs[0].limits;
  const axis = v3(link.dofs[0].axis);
  const side = v3(link.axis2);
  const carriage = r * 2.2;
  const [y0, y1] = [lo - carriage / 2 - r, hi + carriage / 2 + r];
  const length = y1 - y0;
  const mid = (y0 + y1) / 2;
  const lift = (x: number) => new THREE.Vector3(x, 0, 0);
  const along = (y: number) => new THREE.Vector3(0, y, 0);
  const fixed = axisFrame(axis, side);
  fixed.add(
    part(block(r * 1.2, length, r * 2.4).translate(-r * 1.05, mid, 0), mats, 'alu', { label: 'Rail', layer: 'structure' }),
    part(block(r * 0.25, length * 0.98, r * 0.35).translate(-r * 0.36, mid, r * 0.8), mats, 'steel', { label: 'Guide (left)', layer: 'bearing', explode: lift(r * 1.2) }),
    part(block(r * 0.25, length * 0.98, r * 0.35).translate(-r * 0.36, mid, -r * 0.8), mats, 'steel', { label: 'Guide (right)', layer: 'bearing', explode: lift(r * 1.2) }),
    part(pin(r * 0.22, length * 0.96, 'y').translate(-r * 0.75, mid, 0), mats, 'brass', { label: 'Ball screw', layer: 'drive', explode: lift(r * 2.4) }),
    part(block(r * 1.9, r * 0.9, r * 2.8).translate(-r * 0.9, y1 + r * 0.45, 0), mats, 'cap', { label: 'End block', layer: 'housing', explode: along(r * 2) }),
    part(block(r * 2.4, r * 2.6, r * 2.4).translate(-r * 1.05, y0 - r * 1.3, 0), mats, 'cap', { label: 'Stepper motor', layer: 'drive', explode: along(-r * 3) }),
    part(block(r * 2.5, r * 0.25, r * 2.5).translate(-r * 1.05, y0 - r * 0.05, 0), mats, 'alu', { label: 'Motor plate', layer: 'structure', explode: along(-r * 1.6) }),
  );
  const ring = part(block(r * 0.08, carriage * 0.9, r * 2.62).translate(-r * 0.1, 0, 0), mats, 'accent', { label: 'Load strip', layer: 'sensor' });
  ring.material = mats.get('accent').clone();
  const moving = axisFrame(axis, side);
  moving.add(
    part(block(r * 0.9, carriage, r * 2.6), mats, 'shell', { label: 'Carriage', layer: 'housing', explode: lift(r * 2) }),
    part(block(r * 0.5, carriage * 0.5, r * 0.8).translate(-r * 0.7, 0, 0), mats, 'brass', { label: 'Screw nut', layer: 'drive', explode: lift(r * 0.8) }),
    ring,
  );
  const [s0, s1] = [new THREE.Group(), new THREE.Group()];
  s0.add(fixed);
  s1.add(moving);
  return { stages: [s0, s1], exit: () => r * 1.3, indicators: [ring], size: r * 3 };
};
