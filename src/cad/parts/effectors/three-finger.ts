/**
 * Three-finger adaptive gripper: a motor drives a nut up a lead screw inside the palm, and three two-link
 * fingers at 120° pivot in clevis bases on the palm rim to close on round parts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullCylinder } from '../../common/hull';
import { lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import { block, pin, torusAbout } from '../shapes/blocks';
import { coil, fingerLink, plate, thickAlongY } from '../shapes/mechanical';
import { adapterPlate, opening, payloadBall, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

const TILT = 0.26;
const Z = new THREE.Vector3(0, 0, 1);

/** The drive nut: a hub with an arm towards each finger base (local XY, arms at 0°, 120°, 240°). */
function spider(hub: number, arm: number, width: number, bore: number): THREE.Shape {
  const s = new THREE.Shape();
  const a = Math.asin(width / 2 / hub);
  for (let i = 0; i < 3; i++) {
    const t = (i * 2 * Math.PI) / 3;
    const at = (along: number, across: number): [number, number] => [along * Math.cos(t) - across * Math.sin(t), along * Math.sin(t) + across * Math.cos(t)];
    const corners = [at(hub * Math.cos(a), -width / 2), at(arm, -width / 2), at(arm, width / 2), at(hub * Math.cos(a), width / 2)];
    corners.forEach(([x, y], j) => (i === 0 && j === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
    s.absarc(0, 0, hub, t + a, t + (2 * Math.PI) / 3 - a, false);
  }
  s.holes.push(new THREE.Path().absarc(0, 0, bore, 0, Math.PI * 2, true));
  return s;
}

export const threeFingerGripper: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 2.6);
  const { mats } = o;
  const at = opening(s);
  const palm = s * 1.12, rim = s * 0.62;
  const span = Math.max(reach - palm, s * 1.4);
  // The distal link's rounded end stops on the tool point.
  const [L1, L2] = [span * 0.55, (span * 0.45 - s * 0.13) / Math.cos(TILT)];
  const ring = part(torusAbout('y', s * 0.94, s * 0.03).translate(0, s * 0.82, 0), mats, 'steel', { label: 'Status ring', layer: 'sensor', explode: at(2) });
  const nut = new THREE.Group();
  nut.add(part(thickAlongY(plate(spider(s * 0.17, s * 0.5, s * 0.14, s * 0.07), s * 0.08)).translate(0, s * 0.74, 0), mats, 'alu', { label: 'Drive nut', layer: 'drive', explode: at(1) }));
  const screw = mergeGeometries([
    lathe(solidCylinder(s * 0.055, s * 0.64, s * 0.81), 20),
    coil(s * 0.058, s * 0.012, s * 0.65, s * 0.8, 6).toNonIndexed(),
  ]);
  g.add(
    part(lathe(solidCylinder(s * 0.95, s * 0.14, s * 0.82, s * 0.08)), mats, 'shell', { label: 'Palm housing', layer: 'housing', explode: at(2) }),
    part(lathe(solidCylinder(s * 0.3, s * 0.25, s * 0.56, s * 0.03)), mats, 'magnet', { label: 'Motor', layer: 'drive', explode: at(1) }),
    part(screw, mats, 'steel', { label: 'Lead screw', layer: 'drive', explode: at(1) }),
    nut,
    part(lathe(solidCylinder(s * 0.9, s * 0.82, s * 0.94, s * 0.03)), mats, 'cap', { label: 'Palm plate', layer: 'housing', explode: at(2.2) }),
  );
  // Finger parts open radially, then the distal link slides off its knuckle along its own length.
  const fingerOpen = at(2.2, 0.8);
  const inKnuckle = (v: THREE.Vector3) => v.clone().applyAxisAngle(Z, -TILT);
  const distalOpen = inKnuckle(fingerOpen).add(at(0.45));
  const cheeks = mergeGeometries([-1, 1].map((k) => block(s * 0.36, s * 0.32, s * 0.08).translate(0, s * 0.02, k * s * 0.19)).concat(block(s * 0.36, s * 0.08, s * 0.46).translate(0, -s * 0.12, 0)));
  const pivots = [0, 1, 2].map((i) => {
    const pivot = new THREE.Group();
    pivot.position.set(rim, palm, 0);
    const knuckle = new THREE.Group();
    knuckle.position.set(0, L1, 0);
    // Positive z rotation leans +Y towards -X, i.e. inwards.
    knuckle.rotation.z = TILT;
    knuckle.add(
      part(fingerLink(L2, s * 0.3, s * 0.26, s * 0.24, s * 0.055), mats, 'alu', { label: 'Distal phalanx', layer: 'structure', explode: distalOpen }),
      part(block(s * 0.08, L2 * 0.6, s * 0.22).translate(-s * 0.17, L2 * 0.6, 0), mats, 'rubber', { label: 'Finger pad', layer: 'structure', explode: distalOpen.clone().add(at(0, -0.35)) }),
      part(pin(s * 0.055, s * 0.44, 'z'), mats, 'steel', { label: 'Knuckle pin', layer: 'bearing', explode: inKnuckle(fingerOpen).add(at(0, 0, 0.45)) }),
    );
    pivot.add(part(fingerLink(L1, s * 0.36, s * 0.3, s * 0.34, s * 0.06), mats, 'alu', { label: 'Proximal phalanx', layer: 'structure', explode: fingerOpen }), knuckle);
    const arm = new THREE.Group();
    arm.rotation.y = (i * 2 * Math.PI) / 3;
    arm.add(
      part(cheeks.clone().translate(rim, palm, 0), mats, 'alu', { label: 'Finger base', layer: 'structure', explode: at(2.2, 0.5) }),
      part(pin(s * 0.06, s * 0.52, 'z').translate(rim, palm, 0), mats, 'steel', { label: 'Pivot pin', layer: 'bearing', explode: at(2.2, 0.5, 0.45) }),
      pivot,
    );
    g.add(arm);
    return pivot;
  });
  g.add(
    part(lathe(solidCylinder(s * 0.26, s * 0.56, s * 0.64, s * 0.02)), mats, 'alu', { label: 'Gearhead', layer: 'drive', explode: at(1) }),
    part(lathe(solidCylinder(s * 0.7, s * 0.21, s * 0.24), 40), mats, 'pcb', { label: 'Driver board', layer: 'sensor', explode: at(1) }),
    ring,
    hullCylinder(s * 0.95, s * 0.14, s * 0.94),
    hullCylinder(s * 1.05, s * 0.94, palm + span),
  );
  adapterPlate(g, mats, s);
  // Fingertip pad, in the pivot frame before the finger leans in.
  const tip = { x: -L2 * Math.sin(TILT) - s * 0.21, y: L1 + L2 * Math.cos(TILT) * 0.6 };
  const radiusAt = (lean: number) => rim + tip.x * Math.cos(lean) - tip.y * Math.sin(lean);
  const leanFor = (gap: number) => {
    let [lo, hi] = [-0.6, 0.6];
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (radiusAt(mid) > gap / 2) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const set = (gap: number) => {
    const lean = leanFor(gap);
    pivots.forEach((p) => (p.rotation.z = lean));
    nut.position.y = s * 0.1 * lean;
  };
  const grip = { min: Math.max(2 * radiusAt(0.6), s * 0.2), max: 2 * radiusAt(-0.6), rest: 2 * radiusAt(0), set };
  set(grip.rest);
  return { group: g, grip, reach: palm + span, payload: payloadBall(g, mats, s, o.payload, reach - span * 0.3, at(2.2)) };
};
