/** Three-finger adaptive gripper: fingers at 120° pivot on the palm rim and close on round parts. */
import * as THREE from 'three';
import { hullCylinder } from '../../common/hull';
import { lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import { block, pin } from '../shapes/blocks';
import { away, mountPlate, payloadBall, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

const TILT = 0.26;

export const threeFingerGripper: EffectorBuilder = (o) => {
  const { g, s, reach } = toolFrame(o, 2.6);
  const { mats } = o;
  const palm = s * 1.0, rim = s * 0.62;
  const span = Math.max(reach - palm, s * 1.4);
  const [L1, L2] = [span * 0.55, (span * 0.45) / Math.cos(TILT)];
  mountPlate(g, mats, s);
  g.add(
    part(lathe(solidCylinder(s * 0.95, s * 0.18, palm, s * 0.08)), mats, 'shell', { label: 'Palm housing', layer: 'housing', explode: away(s * 1.2) }),
    part(lathe(solidCylinder(s * 0.5, palm, palm + s * 0.08)), mats, 'alu', { label: 'Finger hub', layer: 'drive', explode: away(s * 1.6) }),
    hullCylinder(s * 0.95, s * 0.18, palm),
    hullCylinder(s * 1.05, palm, palm + span),
  );
  const pivots = [0, 1, 2].map((i) => {
    const radial = new THREE.Vector3(s * 1.2, 0, 0);
    const pivot = new THREE.Group();
    pivot.position.set(rim, palm, 0);
    const knuckle = new THREE.Group();
    knuckle.position.set(0, L1, 0);
    // Positive z rotation leans +Y towards -X, i.e. inwards.
    knuckle.rotation.z = TILT;
    knuckle.add(
      part(pin(s * 0.14, s * 0.5, 'z'), mats, 'steel', { label: 'Knuckle pin', layer: 'bearing', explode: radial }),
      part(block(s * 0.3, L2, s * 0.36).translate(0, L2 / 2, 0), mats, 'alu', { label: 'Distal phalanx', layer: 'structure', explode: radial }),
      part(block(s * 0.08, L2 * 0.6, s * 0.32).translate(-s * 0.17, L2 * 0.6, 0), mats, 'rubber', { label: 'Finger pad', layer: 'structure', explode: radial }),
    );
    pivot.add(part(block(s * 0.36, L1, s * 0.42).translate(0, L1 / 2, 0), mats, 'alu', { label: 'Proximal phalanx', layer: 'structure', explode: radial }), knuckle);
    const arm = new THREE.Group();
    arm.rotation.y = (i * 2 * Math.PI) / 3;
    arm.add(pivot);
    g.add(arm);
    return pivot;
  });
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
  const set = (gap: number) => pivots.forEach((p) => (p.rotation.z = leanFor(gap)));
  const grip = { min: Math.max(2 * radiusAt(0.6), s * 0.2), max: 2 * radiusAt(-0.6), rest: 2 * radiusAt(0), set };
  set(grip.rest);
  return { group: g, grip, reach: palm + span, payload: payloadBall(g, mats, s, o.payload, reach - span * 0.3) };
};
