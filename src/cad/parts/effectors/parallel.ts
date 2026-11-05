/** Electric two-jaw gripper: a motor turns a pinion between two racks, and each jaw rides a carriage on one linear guide. */
import * as THREE from 'three';
import { screwsAt } from '../../common/fasteners';
import { hullBox } from '../../common/hull';
import { lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import { block, pin } from '../shapes/blocks';
import { outline, plate, rack, spurGear } from '../shapes/mechanical';
import { adapterPlate, opening, payloadBall, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

/** Serrated pad outline on a jaw's inner face, from y0 to y1, ridges reaching x = `face`. */
function padOutline(k: number, s: number, y0: number, y1: number, face: number): THREE.Shape {
  const ridges = Math.max(3, Math.round((y1 - y0) / (0.07 * s)));
  const pts: [number, number][] = [[-0.14 * s, y0]];
  for (let i = 0; i <= ridges; i++) {
    const y = y0 + ((y1 - y0) * i) / ridges;
    pts.push([-face, y]);
    if (i < ridges) pts.push([-face + 0.03 * s, y + (y1 - y0) / (2 * ridges)]);
  }
  pts.push([-0.14 * s, y1]);
  return outline(pts.map(([x, y]) => [k * x, y]));
}

export const parallelGripper: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 2.4);
  const { mats } = o;
  const at = opening(s);
  const top = 0.98 * s;
  const fingerLen = Math.max(reach - top, s * 1.4);
  const tipY = top + fingerLen;
  const pad = Math.min(Math.max(fingerLen * 0.5, s * 0.5), s * 1.2);
  // A pad's contact face sits 0.24 s inside its jaw's centre line; the racks run on the pinion's pitch circle.
  const face = s * 0.24, pitchR = s * 0.18;
  const pinion = part(spurGear(s * 0.2, 12, s * 0.1).translate(0, s * 0.77, 0), mats, 'steel', { label: 'Pinion', layer: 'drive', explode: at(1) });
  const light = part(block(s * 0.1, s * 0.06, s * 0.04).translate(s * 0.72, s * 0.3, s * 0.56), mats, 'accent', { label: 'Status LED', layer: 'sensor', explode: at(2) });
  // Green: the studio's overlays are red, and a red mark on the housing reads as one of them.
  const led = mats.get('accent').clone() as THREE.MeshPhysicalMaterial;
  led.color.set('#3fae6a');
  led.emissive.set('#3fae6a');
  light.material = led;
  g.add(
    part(block(s * 1.84, s * 0.88, s * 1.1).translate(0, s * 0.58, 0), mats, 'shell', { label: 'Housing', layer: 'housing', explode: at(2) }),
    part(lathe(solidCylinder(s * 0.27, s * 0.27, s * 0.6, s * 0.03)), mats, 'magnet', { label: 'Motor', layer: 'drive', explode: at(1) }),
    pinion,
    part(block(s * 1.7, s * 0.08, s * 0.22).translate(0, s * 0.9, 0), mats, 'steel', { label: 'Linear guide', layer: 'bearing', explode: at(2.3) }),
  );
  const jaws = ([-1, 1] as const).map((k) => {
    const jaw = new THREE.Group();
    const finger = outline([[-0.14, top / s], [0.18, top / s], [0.18, top / s + 0.35], [0.06, tipY / s], [-0.14, tipY / s]].map(([x, y]) => [k * x * s, y * s]));
    jaw.add(
      part(rack(s * 1.05, s * 0.08, s * 0.03, s * 0.1, s * 0.1, k === 1 ? -1 : 1).translate(-k * s * 0.525, s * 0.77, k * pitchR), mats, 'steel', { label: 'Rack', layer: 'drive', explode: at(2.6, k) }),
      part(plate(finger, s * 0.66), mats, 'alu', { label: 'Finger', layer: 'structure', explode: at(2.6, k) }),
      part(plate(padOutline(k, s, tipY - 0.05 * s - pad, tipY - 0.05 * s, face), s * 0.6, s * 0.01), mats, 'rubber', { label: 'Finger pad', layer: 'structure', explode: at(2.6, k * 0.6) }),
      part(block(s * 0.3, s * 0.16, s * 0.7).translate(0, s * 0.9, 0), mats, 'alu', { label: 'Carriage', layer: 'bearing', explode: at(2.6, k) }),
      screwsAt(mats, [-1, 1].map((z) => new THREE.Vector3(k * s * 0.18, top + s * 0.16, z * s * 0.18)), s * 0.05, 'x', k, { label: 'Finger screws', layer: 'fastener', explode: at(2.6, k * 1.25) }),
    );
    g.add(jaw);
    return { jaw, k };
  });
  g.add(
    part(lathe(solidCylinder(s * 0.24, s * 0.6, s * 0.7, s * 0.02)), mats, 'alu', { label: 'Gearhead', layer: 'drive', explode: at(1) }),
    part(block(s * 1.5, s * 0.05, s * 0.9).translate(0, s * 0.235, 0), mats, 'pcb', { label: 'Driver board', layer: 'sensor', explode: at(1) }),
    light,
    ...([-1, 1] as const).map((k) => part(block(s * 0.18, s * 0.8, s * 1.0, s * 0.05).translate(k * s * 1.01, s * 0.58, 0), mats, 'cap', { label: 'End cap', layer: 'housing', explode: at(2, k * 0.5) })),
    part(pin(s * 0.08, s * 0.18, 'x').translate(s * 1.18, s * 0.45, 0), mats, 'cap', { label: 'Connector', layer: 'cable', explode: at(2, 0.5) }),
    hullBox(s * 2.24, s * 0.88, s * 1.1, new THREE.Vector3(0, s * 0.58, 0)),
    // One box over the jaws' whole travel, so the hull holds at any opening.
    hullBox(s * 2.2, fingerLen, s * 0.7, new THREE.Vector3(0, top + fingerLen / 2, 0)),
  );
  adapterPlate(g, mats, s);
  const set = (gap: number) => {
    jaws.forEach(({ jaw, k }) => (jaw.position.x = k * (gap / 2 + face)));
    pinion.rotation.y = gap / 2 / pitchR;
  };
  const grip = { min: s * 0.05, max: s * 1.4, rest: s * 0.62, set };
  set(grip.rest);
  return { group: g, grip, reach, payload: payloadBall(g, mats, s, o.payload, tipY - 0.05 * s - pad / 2, at(2.6)) };
};
