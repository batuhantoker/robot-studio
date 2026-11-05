/**
 * The motor and gear of a revolute joint. By default a housed drive astride the interface, bolted to the wall on either
 * side; a design can move the stator to the child, or the whole drive into a body with a shaft out through the interface.
 */
import * as THREE from 'three';
import { boltCircle } from '../../common/fasteners';
import { hollowCylinder, lathe } from '../../common/lathe';
import { axisFrame, v3 } from '../../common/orient';
import { part, partOf } from '../../common/part';
import type { MaterialSet } from '../../materials/library';
import { buildRotor } from '../actuators/rotary/rotor';
import { buildStator } from '../actuators/rotary/stator';
import type { JointModule } from '../types';
import type { Joint, Side } from './plan';
import { endOn, faceRadius } from './recipe';

/** Stator and rotor meet here along the drive's own length, a fraction of L from its middle. */
const SPLIT = 0.13;
/** Load below this reads as rest: gravity alone keeps most joints a little loaded, and a seam should not glow for that. */
const AT_REST = 0.5;

const reach = (j: Joint, s: Side, away: number) => (j.kind === 'hinge' ? s.depth + (s.centre - j.plane) * away : Infinity);

/** A drive fits the smaller side, and a knuckle's depth, so it never breaks through the casting. */
export const driveSize = (j: Joint) => {
  const rim = Math.min(j.parent.radius, j.child.radius);
  const room = Math.min(reach(j, j.parent, -1) / (0.5 + SPLIT), reach(j, j.child, 1) / (0.5 - SPLIT)) * 0.5;
  const R = j.drive?.radius ?? Math.min(rim * 0.74, room / 1.3);
  return { R, L: R * 1.3 };
};

/** The hole through the interface wall: a drive astride it passes whole, a drive kept to one body sends only its shaft. */
export const driveBores = (j: Joint) => ({ r: j.drive?.centre !== undefined ? (j.drive.shaft ?? driveSize(j).R * 0.4) * 1.08 : driveSize(j).R * 1.03 });

/** Neutral until the joint is really working; the frame loop only ever sets the intensity. */
export class LoadGlow extends THREE.MeshPhysicalMaterial {
  private level = 0;

  override get emissiveIntensity(): number {
    return this.level;
  }

  override set emissiveIntensity(v: number) {
    this.level = Math.max(0, v - AT_REST) * 1.6;
  }
}

/** Every part of a half moves as one: a drive coming out of its socket, not a cloud of loose discs. */
function explodeTogether(g: THREE.Object3D, by: number): void {
  g.traverse((o) => {
    const meta = partOf(o);
    if (meta) meta.explode.set(0, by, 0);
  });
}

export function seatedDrive(mats: MaterialSet, j: Joint, gap: number, parentWall: number, childWall: number): JointModule {
  const { R, L } = driveSize(j);
  const axis = v3(j.axis);
  const seat = axis.clone().multiplyScalar(j.plane);
  const inChild = j.drive?.in === 'child';
  const centre = j.drive?.centre;
  const facing = inChild ? -1 : 1;
  /** The drive's frame: its stator towards local −y, so towards the body that holds it. */
  const frame = () => {
    const g = axisFrame(axis.clone().multiplyScalar(facing));
    if (centre !== undefined) g.position.copy(axis).multiplyScalar(centre);
    else g.position.copy(seat).addScaledVector(axis, -facing * SPLIT * L);
    return g;
  };
  const rim = Math.min(j.parent.radius, j.child.radius);
  const seam = Math.min(...(['parent', 'child'] as const).map((role) => faceRadius(endOn(j, role))));
  const opensBy = j.drive?.opens ?? (j.kind === 'hinge' ? (reach(j, j.parent, -1) + reach(j, j.child, 1)) * 0.82 : rim * 1.9);
  const out = opensBy * 0.3;

  /** A ring from `inner` out to `outer` about the axis, its `face` at `y` on the axis from the seat, thickening towards `dir`. */
  const ring = (y: number, dir: 1 | -1, inner: number, outer: number, label: string) => {
    const g = axisFrame(axis);
    g.position.copy(seat);
    const t = dir * R * 0.16;
    g.add(
      part(lathe(hollowCylinder(outer, inner, Math.min(y, y + t), Math.max(y, y + t), R * 0.02), 64), mats, 'alu', { label, layer: 'structure' }),
      boltCircle(mats, 6, (outer + inner) / 2, R * 0.05, y + t, dir, { label: `${label} screws`, layer: 'fastener' }),
    );
    return g;
  };
  const wallFace = (wall: number, dir: 1 | -1) => dir * (gap / 2 + wall + 0.0002);
  const astride = (wall: number, dir: 1 | -1, label: string) => ring(wallFace(wall, dir), dir, R * 1.002, Math.max(R * 1.03, Math.min(R * 1.18, seam - wall * 1.7 - 0.003)), label);

  const stator = frame();
  stator.add(buildStator(mats, R, L));
  const rotor = frame();
  rotor.add(buildRotor(mats, R, L));
  const [statorSide, rotorSide]: THREE.Object3D[][] = [[stator], [rotor]];
  if (centre !== undefined) {
    // Held in its body by a ring round the stator; a hollow shaft carries the output across the interface to the other one.
    const r = j.drive?.shaft ?? R * 0.4;
    const along = centre - j.plane;
    statorSide.push(ring(along + facing * 0.1 * L, 1, R * 1.002, R * 1.26, 'Stator mount'));
    const far = inChild ? -(gap / 2 + parentWall + 0.003) : gap / 2 + childWall + 0.003;
    const near = along - facing * 0.5 * L;
    const shaft = axisFrame(axis);
    shaft.position.copy(seat);
    shaft.add(part(lathe(hollowCylinder(r, r * 0.62, Math.min(near, far), Math.max(near, far)), 40), mats, 'steel', { label: 'Output shaft', layer: 'drive' }));
    const wall = inChild ? parentWall : childWall;
    rotorSide.push(shaft, ring(wallFace(wall, inChild ? -1 : 1), inChild ? -1 : 1, r * 1.002, r * 1.4, 'Output mount'));
  } else {
    statorSide.push(astride(inChild ? childWall : parentWall, inChild ? 1 : -1, 'Stator mount'));
    rotorSide.push(astride(inChild ? parentWall : childWall, inChild ? -1 : 1, 'Rotor mount'));
  }

  const face = axisFrame(axis);
  face.position.copy(seat);
  const hole = centre !== undefined ? driveBores(j).r : R * 1.05;
  const seal = part(lathe(hollowCylinder(seam * 0.96, hole, -gap * 0.42, gap * 0.42), 64), mats, 'rubber', { label: 'Joint seal', layer: 'bearing' });
  const load = part(new THREE.TorusGeometry(seam * 0.965, gap * 0.34, 8, 96).rotateX(Math.PI / 2), mats, 'accent', { label: 'Load ring', layer: 'sensor' });
  const accent = mats.get('accent');
  load.material = new LoadGlow({ color: '#26282c', roughness: accent.roughness, emissive: accent.emissive });
  face.add(seal, load);

  if (j.drive?.cut) for (const g of [...statorSide, ...rotorSide, face]) g.userData.cut = j.drive.cut;
  const [s0, s1] = [new THREE.Group(), new THREE.Group()];
  s0.add(...(inChild ? rotorSide : statorSide), face);
  s1.add(...(inChild ? statorSide : rotorSide));
  // Stators and rotors are built in frames that turn with `facing`, the rest about the axis itself.
  explodeTogether(s0, out);
  explodeTogether(s1, -out);
  if (inChild) {
    explodeTogether(rotor, -out);
    explodeTogether(stator, out);
  }
  return { stages: [s0, s1], exit: () => rim, indicators: [load], size: opensBy / 1.3 };
}
