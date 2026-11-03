/** Vacuum cup on a spring plunger: the bellows draw in and the valve lamp lights when suction is on. */
import * as THREE from 'three';
import { hullBox, hullCylinder } from '../../common/hull';
import { type Profile, hollowCylinder, lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import { block } from '../shapes/blocks';
import { away, mountPlate, sideHose, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

function bellows(s: number, y0: number, y1: number): Profile {
  const h = (y1 - y0) / 6;
  const zig: Profile = Array.from({ length: 7 }, (_, i) => [i % 2 ? s * 0.5 : s * 0.32, y0 + i * h]);
  return [[s * 0.16, y0], ...zig, [s * 0.16, y1], [s * 0.16, y0]];
}

const cup = (s: number, y0: number, y1: number): Profile =>
  [[s * 0.16, y0], [s * 0.34, y0], [s * 0.78, y1 - s * 0.05], [s * 0.78, y1], [s * 0.66, y1], [s * 0.3, y0 + s * 0.12], [s * 0.16, y0 + s * 0.12], [s * 0.16, y0]];

export const suctionCup: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 2.2);
  const { mats } = o;
  const [stem0, flex0, cup0] = [s * 0.73, reach - s * 0.84, reach - s * 0.32];
  mountPlate(g, mats, s);
  const lamp = part(block(s * 0.22, s * 0.12, s * 0.22).translate(0, s * 0.46, s * 0.47), mats, 'accent', { label: 'Valve lamp', layer: 'sensor' });
  lamp.material = mats.get('accent').clone();
  g.add(
    part(block(s * 1.3, s * 0.55, s * 0.9).translate(0, s * 0.46, 0), mats, 'shell', { label: 'Vacuum generator', layer: 'housing', explode: away(s * 1.3) }),
    lamp,
    sideHose(mats, new THREE.Vector3(s * 0.65, s * 0.46, 0), s, 'Air line'),
    part(lathe(solidCylinder(s * 0.2, stem0, flex0)), mats, 'steel', { label: 'Spring plunger', layer: 'structure', explode: away(s * 0.9) }),
    part(lathe(hollowCylinder(s * 0.34, s * 0.21, stem0, stem0 + (flex0 - stem0) * 0.45)), mats, 'alu', { label: 'Level compensator', layer: 'housing', explode: away(s * 1.1) }),
    hullBox(s * 1.3, s * 0.55, s * 0.9, away(s * 0.46)),
    hullCylinder(s * 0.34, stem0, flex0),
    hullCylinder(s * 0.78, flex0, reach),
  );
  // The flexible tip compresses towards the plunger when the vacuum pulls.
  const tipGroup = new THREE.Group();
  tipGroup.position.y = flex0;
  tipGroup.add(
    part(lathe(bellows(s, 0, cup0 - flex0)), mats, 'rubber', { label: 'Bellows', layer: 'structure', explode: away(s * 0.6) }),
    part(lathe(cup(s, cup0 - flex0, reach - flex0)), mats, 'rubber', { label: 'Suction cup', layer: 'structure', explode: away(s * 0.9) }),
  );
  g.add(tipGroup);
  const light = lamp.material as THREE.MeshPhysicalMaterial;
  const set = (gap: number) => {
    const on = gap <= 0;
    tipGroup.scale.y = on ? 0.86 : 1;
    light.emissiveIntensity = on ? 1.4 : 0.15;
  };
  const grip = { min: 0, max: s, rest: s, set };
  set(grip.rest);
  return { group: g, grip, reach, payload: null };
};
