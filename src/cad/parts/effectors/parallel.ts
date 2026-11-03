/** Two-jaw parallel gripper; the jaws slide symmetrically to the commanded opening. */
import * as THREE from 'three';
import { hullBox } from '../../common/hull';
import { part } from '../../common/part';
import { block } from '../shapes/blocks';
import { away, mountPlate, payloadBall, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

export const parallelGripper: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 2.4);
  const { mats } = o;
  const fingerLen = Math.max(reach - s * 1.1, s * 1.2);
  mountPlate(g, mats, s);
  g.add(
    part(block(s * 2.2, s * 0.9, s * 1.1).translate(0, s * 0.65, 0), mats, 'shell', { label: 'Gripper body', layer: 'housing', explode: away(s * 1.4) }),
    part(block(s * 1.6, s * 0.2, s * 0.6).translate(0, s * 0.65, s * 0.58), mats, 'pcb', { label: 'Finger drive', layer: 'drive', explode: away(s * 1.4).add(new THREE.Vector3(0, 0, s)) }),
    hullBox(s * 2.2, s * 0.9, s * 1.1, away(s * 0.65)),
    // One box over the jaws' whole travel, so the hull holds at any opening.
    hullBox(s * 2.2, fingerLen, s * 0.7, away(s * 1.1 + fingerLen / 2)),
  );
  // A jaw's contact face sits 0.24 s inside its centre line.
  const face = s * 0.24;
  const jaws = [-1, 1].map((k) => {
    const jaw = new THREE.Group();
    jaw.add(
      part(block(s * 0.32, fingerLen, s * 0.7).translate(0, s * 1.1 + fingerLen / 2, 0), mats, 'alu', { label: 'Finger', layer: 'structure', explode: new THREE.Vector3(k * s * 1.2, s * 2, 0) }),
      part(block(s * 0.1, fingerLen * 0.4, s * 0.6).translate(-k * s * 0.19, s * 1.1 + fingerLen * 0.75, 0), mats, 'rubber', { label: 'Finger pad', layer: 'structure', explode: new THREE.Vector3(k * s * 1.6, s * 2, 0) }),
    );
    g.add(jaw);
    return { jaw, k };
  });
  const set = (gap: number) => jaws.forEach(({ jaw, k }) => (jaw.position.x = k * (gap / 2 + face)));
  const grip = { min: s * 0.05, max: s * 1.4, rest: s * 0.62, set };
  set(grip.rest);
  // Held between the pads, not hanging past the fingertips.
  return { group: g, grip, reach, payload: payloadBall(g, mats, s, o.payload, s * 1.1 + fingerLen * 0.7) };
};
