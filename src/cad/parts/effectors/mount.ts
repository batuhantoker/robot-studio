/** Pieces every effector shares: the tool frame on the flange, the mounting plate, a held payload. */
import * as THREE from 'three';
import { boltCircle } from '../../common/fasteners';
import { hullCylinder, hullSphere } from '../../common/hull';
import { lathe, solidCylinder } from '../../common/lathe';
import { axisFrame } from '../../common/orient';
import { part } from '../../common/part';
import type { MaterialSet } from '../../materials/library';
import type { EffectorOptions } from './types';

export const away = (y: number) => new THREE.Vector3(0, y, 0);

/** Local +Y runs along the approach; `reach` is how far the working end sits from the flange. */
export function toolFrame(o: EffectorOptions, minReach: number) {
  const g = axisFrame(o.approach);
  g.position.copy(o.flange);
  const along = o.tip.clone().sub(o.flange).dot(o.approach.clone().normalize());
  return { g, s: o.size, along, reach: Math.max(along, o.size * minReach) };
}

export function mountPlate(g: THREE.Group, mats: MaterialSet, s: number): void {
  g.add(
    part(lathe(solidCylinder(s * 0.8, 0, s * 0.18, s * 0.03)), mats, 'alu', { label: 'Tool flange', layer: 'structure', explode: away(s * 0.6) }),
    boltCircle(mats, 6, s * 0.55, s * 0.07, s * 0.18, 1, { label: 'Tool screws', layer: 'fastener', explode: away(s * 2.2) }),
    hullCylinder(s * 0.8, 0, s * 0.18),
  );
}

export function payloadBall(g: THREE.Group, mats: MaterialSet, s: number, payload: number, y: number): THREE.Object3D | null {
  if (!(payload > 0)) return null;
  const ball = part(new THREE.SphereGeometry(s * 0.34, 24, 16), mats, 'payload', { label: `Payload ${payload} kg`, layer: 'structure', explode: away(s * 3) });
  ball.position.set(0, y, 0);
  g.add(ball, hullSphere(s * 0.34, away(y)));
  return ball;
}

/** A flexible line (air, power, weld wire) leaving a tool sideways and curling back towards the arm. */
export function sideHose(mats: MaterialSet, from: THREE.Vector3, s: number, label: string): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3([
    from,
    from.clone().add(new THREE.Vector3(s * 0.6, -s * 0.2, 0)),
    from.clone().add(new THREE.Vector3(s * 1.0, -s * 1.2, 0)),
    from.clone().add(new THREE.Vector3(s * 0.9, -s * 2.4, 0)),
  ]);
  return part(new THREE.TubeGeometry(curve, 24, s * 0.09, 8), mats, 'rubber', { label, layer: 'cable', explode: new THREE.Vector3(s * 1.5, 0, 0) });
}
