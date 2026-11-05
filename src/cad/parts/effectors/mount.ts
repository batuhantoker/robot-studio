/**
 * Pieces every effector shares: tool frame, adapter plate, payload, hose port.
 * Tools explode in stack order along the approach so no part passes through another; sideways only for pairs and pins.
 */
import * as THREE from 'three';
import { boltCircle } from '../../common/fasteners';
import { hullBox, hullCylinder } from '../../common/hull';
import { type Profile, lathe, solidCylinder } from '../../common/lathe';
import { axisFrame } from '../../common/orient';
import { part } from '../../common/part';
import type { MaterialSet } from '../../materials/library';
import { pin } from '../shapes/blocks';
import type { EffectorOptions } from './types';

/** A little wider than a wrist flange, so the plate reads as its own part with its screws in view past a tool's body. */
const PLATE_R = 0.9;

/** A port's fitting and stub radii and its reach out of the body (tool sizes). */
const FIT_R = 0.08;
const STUB_R = 0.06;
const STUB_LEN = 0.32;

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
    [0, -0.05 * s], [0.3 * s, -0.05 * s], [0.32 * s, 0], [(PLATE_R - 0.03) * s, 0], [PLATE_R * s, 0.03 * s], [PLATE_R * s, face - 0.03 * s], [(PLATE_R - 0.03) * s, face], [0, face],
  ];
  g.add(
    part(lathe(profile), mats, 'alu', { label: 'Adapter plate', layer: 'structure', explode: at(0.2) }),
    boltCircle(mats, 8, s * 0.75, s * 0.075, face, 1, { label: 'Plate screws', layer: 'fastener', explode: at(SCREWS_OPEN) }),
    part(pin(s * 0.045, s * 0.12, 'y').translate(-s * 0.42, face, 0), mats, 'steel', { label: 'Dowel pin', layer: 'fastener', explode: at(SCREWS_OPEN) }),
    hullCylinder(s * PLATE_R, 0, face),
  );
}

/** Payload is physics, not part of the tool: drawn only in Physics mode, and with no hull of its own. */
export function payloadBall(g: THREE.Group, mats: MaterialSet, s: number, payload: number, y: number, explode: THREE.Vector3): THREE.Object3D | null {
  if (!(payload > 0)) return null;
  const ball = part(new THREE.SphereGeometry(s * 0.34, 24, 16), mats, 'payload', { label: `Payload ${payload} kg`, layer: 'structure', explode });
  ball.position.set(0, y, 0);
  ball.visible = false;
  g.add(ball);
  return ball;
}

/**
 * A port on the tool body: a fitting and a capped stub, straight out along x. Nothing runs back past the plate, so it
 * cannot reach the wrist behind it, and its own hull keeps it out of anything beside the tool.
 */
export function hoseStub(mats: MaterialSet, from: THREE.Vector3, s: number, labels: [string, string], open: number, side: 1 | -1 = 1): THREE.Object3D[] {
  const at = opening(s);
  const [fit, stub, seat] = [FIT_R * s, STUB_R * s, 0.14 * s];
  const out = (g: THREE.BufferGeometry) => g.rotateZ(-side * Math.PI / 2).translate(from.x, from.y, from.z);
  const fitting: Profile = [[0, 0], [fit, 0], [fit, 0.1 * s], [stub, 0.12 * s], [stub, seat], [0, seat]];
  return [
    part(out(lathe(fitting, 24)), mats, 'brass', { label: labels[0], layer: 'cable', explode: at(open, side * 0.3) }),
    part(out(lathe(solidCylinder(stub, seat, STUB_LEN * s, 0.02 * s), 24)), mats, 'rubber', { label: labels[1], layer: 'cable', explode: at(open, side * 0.7) }),
    hullBox(STUB_LEN * s, 2 * fit, 2 * fit, from.clone().add(new THREE.Vector3(side * STUB_LEN * s / 2, 0, 0))),
  ];
}
