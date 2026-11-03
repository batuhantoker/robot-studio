/** Tool flange and parallel gripper aimed along the approach direction to the tool point. */
import * as THREE from 'three';
import { boltCircle } from '../../common/fasteners';
import { lathe, solidCylinder } from '../../common/lathe';
import { axisFrame } from '../../common/orient';
import { part } from '../../common/part';
import type { MaterialSet } from '../../materials/library';
import { block } from '../shapes/blocks';

export interface GripperOptions {
  mats: MaterialSet;
  /** Flange centre and tool tip in the last link frame. */
  flange: THREE.Vector3;
  tip: THREE.Vector3;
  approach: THREE.Vector3;
  size: number;
  payload: number;
}

export function buildGripper({ mats, flange, tip, approach, size, payload }: GripperOptions): THREE.Group {
  const g = axisFrame(approach);
  g.position.copy(flange);
  const s = size;
  const reach = Math.max(tip.clone().sub(flange).dot(approach.clone().normalize()), s * 2.4);
  const fingerLen = Math.max(reach - s * 1.1, s * 1.2);
  const away = (y: number) => new THREE.Vector3(0, y, 0);
  const bolts = boltCircle(mats, 6, s * 0.55, s * 0.07, s * 0.18, 1, { label: 'Tool screws', layer: 'fastener', explode: away(s * 2.2) });
  g.add(
    part(lathe(solidCylinder(s * 0.8, 0, s * 0.18, s * 0.03)), mats, 'alu', { label: 'Tool flange', layer: 'structure', explode: away(s * 0.6) }),
    bolts,
    part(block(s * 2.2, s * 0.9, s * 1.1).translate(0, s * 0.65, 0), mats, 'shell', { label: 'Gripper body', layer: 'housing', explode: away(s * 1.4) }),
    part(block(s * 1.6, s * 0.2, s * 0.6).translate(0, s * 0.65, s * 0.58), mats, 'pcb', { label: 'Finger drive', layer: 'drive', explode: away(s * 1.4).add(new THREE.Vector3(0, 0, s)) }),
  );
  for (const k of [-1, 1]) {
    g.add(
      part(block(s * 0.32, fingerLen, s * 0.7).translate(k * s * 0.55, s * 1.1 + fingerLen / 2, 0), mats, 'alu', { label: 'Finger', layer: 'structure', explode: new THREE.Vector3(k * s * 1.2, s * 2, 0) }),
      part(block(s * 0.1, fingerLen * 0.4, s * 0.6).translate(k * s * 0.36, s * 1.1 + fingerLen * 0.75, 0), mats, 'rubber', { label: 'Finger pad', layer: 'structure', explode: new THREE.Vector3(k * s * 1.6, s * 2, 0) }),
    );
  }
  if (payload > 0) {
    const ball = part(new THREE.SphereGeometry(s * 0.34, 24, 16), mats, 'payload', { label: `Payload ${payload} kg`, layer: 'structure', explode: away(s * 3) });
    ball.position.set(0, reach, 0);
    g.add(ball);
  }
  return g;
}
