/**
 * Pieces every effector shares: tool frame, adapter plate, payload, side hose.
 * Tools explode in stack order along the approach so no part passes through another; sideways only for pairs and pins.
 */
import * as THREE from 'three';
import { boltCircle } from '../../common/fasteners';
import { hullCylinder, hullSphere } from '../../common/hull';
import { lathe } from '../../common/lathe';
import { axisFrame } from '../../common/orient';
import { part } from '../../common/part';
import type { MaterialSet } from '../../materials/library';
import { pin } from '../shapes/blocks';
import type { EffectorOptions } from './types';

/** Explode offset in tool sizes: `y` along the approach, `x`/`z` sideways. */
export const opening = (s: number) => (y: number, x = 0, z = 0) => new THREE.Vector3(x * s, y * s, z * s);

/** The adapter plate's face on the tool side, and where its screws hang when opened (tool sizes). */
export const PLATE_FACE = 0.14;
export const SCREWS_OPEN = 0.75;

/**
 * Explode amounts along the approach for a column of parts opened top to bottom, as [top, bottom] spans
 * at rest (tool sizes): each part's top lands `gap` past the previous part's opened bottom, first past `after`.
 */
export function stackOpen(spans: [number, number][], after: number, gap = 0.1): number[] {
  let open = 0;
  return spans.map(([top, bottom]) => {
    open = Math.max(open, after + gap - top);
    after = bottom + open;
    return open;
  });
}

/** Local +Y runs along the approach; `reach` is how far the working end sits from the flange. */
export function toolFrame(o: EffectorOptions, minReach: number) {
  const g = axisFrame(o.approach);
  g.position.copy(o.flange);
  const along = o.tip.clone().sub(o.flange).dot(o.approach.clone().normalize());
  return { g, s: o.size, along, reach: Math.max(along, o.size * minReach) };
}

/** ISO-style adapter plate: a spigot centres it in the wrist flange, a dowel keys the tool, screws come from the tool side. */
export function adapterPlate(g: THREE.Group, mats: MaterialSet, s: number): void {
  const at = opening(s);
  const face = PLATE_FACE * s;
  const profile: [number, number][] = [
    [0, -0.05 * s], [0.3 * s, -0.05 * s], [0.32 * s, 0], [0.75 * s, 0], [0.78 * s, 0.03 * s], [0.78 * s, face - 0.03 * s], [0.75 * s, face], [0, face],
  ];
  g.add(
    part(lathe(profile), mats, 'alu', { label: 'Adapter plate', layer: 'structure', explode: at(0.2) }),
    boltCircle(mats, 4, s * 0.55, s * 0.065, face, 1, { label: 'Plate screws', layer: 'fastener', explode: at(SCREWS_OPEN) }),
    part(pin(s * 0.045, s * 0.12, 'y').translate(-s * 0.42, face, 0), mats, 'steel', { label: 'Dowel pin', layer: 'fastener', explode: at(SCREWS_OPEN) }),
    hullCylinder(s * 0.78, 0, face),
  );
}

export function payloadBall(g: THREE.Group, mats: MaterialSet, s: number, payload: number, y: number, explode: THREE.Vector3): THREE.Object3D | null {
  if (!(payload > 0)) return null;
  const ball = part(new THREE.SphereGeometry(s * 0.34, 24, 16), mats, 'payload', { label: `Payload ${payload} kg`, layer: 'structure', explode });
  ball.position.set(0, y, 0);
  g.add(ball, hullSphere(s * 0.34, new THREE.Vector3(0, y, 0)));
  return ball;
}

/** A flexible line (air, power, weld wire) leaving a tool sideways and curling back towards the arm. */
export function sideHose(mats: MaterialSet, from: THREE.Vector3, s: number, label: string, explode: THREE.Vector3, side: 1 | -1 = 1): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3([
    from,
    from.clone().add(new THREE.Vector3(side * s * 0.6, -s * 0.2, 0)),
    from.clone().add(new THREE.Vector3(side * s * 1.0, -s * 1.2, 0)),
    from.clone().add(new THREE.Vector3(side * s * 0.9, -s * 2.4, 0)),
  ]);
  return part(new THREE.TubeGeometry(curve, 24, s * 0.09, 8), mats, 'rubber', { label, layer: 'cable', explode });
}
