/**
 * The hardware of a prismatic joint. The bar rides the body that carries it and has an exact hull of its own. A rack along it
 * doubles as the key that stops the pair turning; a motor in the guide's pod drives it through a worm and wheel, all in the one
 * plane through the bar's axis, so a section shows the train. The hole in the guide comes from `recipe`, swept over the stroke.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PaintDesign } from '../../../core/robot/schema/design';
import { hullBox, hullCylinder } from '../../common/hull';
import { type Profile, hollowCylinder, lathe, solidCylinder } from '../../common/lathe';
import { axisFrame, v3 } from '../../common/orient';
import { part, partOf } from '../../common/part';
import type { MaterialRole, MaterialSet } from '../../materials/library';
import { buildRotor } from '../actuators/rotary/rotor';
import { buildStator } from '../actuators/rotary/stator';
import { block, pin } from '../shapes/blocks';
import type { JointModule } from '../types';
import { coat } from './casting';
import { LoadGlow } from './drive';
import type { Joint, SlideDrive } from './plan';

const MOST_TEETH = 110;

interface Keyway {
  /** How far along `side` it reaches. */
  u: number;
  w: number;
}

/** The hole of a collar, with the slot a rack passes through. */
function holeOf(path: THREE.Path, square: boolean, inner: number, key: Keyway | undefined): void {
  const pts: [number, number][] = [];
  if (square) {
    pts.push([inner, -inner], ...(key ? [[inner, -key.w], [key.u, -key.w], [key.u, key.w], [inner, key.w]] as [number, number][] : []), [inner, inner], [-inner, inner], [-inner, -inner]);
  } else {
    const a0 = key ? Math.asin(Math.min(0.99, key.w / inner)) : 0;
    if (key) pts.push([key.u, key.w]);
    for (let i = 0; i <= 40; i++) {
      const a = a0 + ((2 * Math.PI - 2 * a0) * i) / 40;
      pts.push([inner * Math.cos(a), inner * Math.sin(a)]);
    }
    if (key) pts.push([key.u, -key.w]);
  }
  pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  path.closePath();
}

/** A collar about local y from `y0` to `y1`: a ring, or a frame round a square bar, slotted for a rack when `key` is given. */
function collarGeometry(square: boolean, inner: number, outer: number, y0: number, y1: number, key?: Keyway): THREE.BufferGeometry {
  if (!square && !key) return lathe(hollowCylinder(outer, inner, y0, y1, (outer - inner) * 0.1), 48);
  const shape = new THREE.Shape();
  if (square) shape.moveTo(-outer, -outer).lineTo(outer, -outer).lineTo(outer, outer).lineTo(-outer, outer).closePath();
  else shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  holeOf(hole, square, inner, key);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 40 }).rotateX(-Math.PI / 2).translate(0, y0, 0);
}

/** A bar of teeth along local y, standing on `u0` and rising to `u1` along x. */
function rackGeometry(y0: number, y1: number, u0: number, u1: number, w: number): THREE.BufferGeometry {
  const tooth = (u1 - u0) * 0.42;
  const root = u1 - tooth;
  const pitch = Math.max(tooth * 2.1, (y1 - y0) / MOST_TEETH);
  const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(root - u0, y1 - y0, w * 2).translate((u0 + root) / 2, (y0 + y1) / 2, 0)];
  for (let y = y0 + pitch / 2; y < y1; y += pitch) parts.push(new THREE.BoxGeometry(tooth, pitch * 0.5, w * 2).translate(root + tooth / 2, y, 0));
  return mergeGeometries(parts)!;
}

/** A spur wheel about local z, centred on the origin. */
function wheelGeometry(r: number, depth: number): THREE.BufferGeometry {
  const teeth = 16;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r * 0.84;
    if (i) shape.lineTo(rr * Math.cos(a), rr * Math.sin(a));
    else shape.moveTo(rr * Math.cos(a), rr * Math.sin(a));
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth / 2);
}

/** Ridges about local y, so the worm reads as one. */
function wormProfile(r: number, y0: number, y1: number): Profile {
  const out: Profile = [[0, y0]];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const y = y0 + ((y1 - y0) * i) / n;
    out.push([i % 2 ? r : r * 0.72, y]);
  }
  out.push([0, y1]);
  return out;
}

/** Comes out sideways as one unit, past the guide. */
function liftOut(g: THREE.Object3D, by: number): void {
  g.traverse((o) => {
    const meta = partOf(o);
    if (meta) meta.explode.set(by, 0, 0);
  });
}

function driveTrain(mats: MaterialSet, d: SlideDrive, out: number): THREE.Group {
  const g = new THREE.Group();
  const shaft = d.wormAt;
  const wormHalf = d.wheel * 0.75;
  const wheel = part(wheelGeometry(d.wheel, d.rackWidth * 1.8).translate(d.wheelAt, d.at, 0), mats, 'brass', { label: 'Worm wheel', layer: 'drive' });
  const axle = part(pin(d.wheel * 0.22, d.rackWidth * 2.1, 'z').translate(d.wheelAt, d.at, 0), mats, 'steel', { label: 'Wheel axle', layer: 'drive' });
  const worm = part(lathe(wormProfile(d.worm, -wormHalf, wormHalf), 24).translate(shaft, d.at, 0), mats, 'steel', { label: 'Worm', layer: 'drive' });
  // The motor's shaft leaves it towards local +y: turned over, that runs back to the worm.
  const motor = new THREE.Group();
  motor.position.set(shaft, d.at + d.away * (wormHalf + d.length / 2), 0);
  if (d.away > 0) motor.rotation.z = Math.PI;
  motor.add(buildStator(mats, d.motor, d.length), buildRotor(mats, d.motor, d.length, false));
  g.add(wheel, axle, worm, motor);
  liftOut(g, out);
  liftOut(wheel, out * 0.5);
  liftOut(axle, out * 0.5);
  return g;
}

export function seatedSlide(mats: MaterialSet, j: Joint, gap: number, wall: number, owner: string, named: Record<string, PaintDesign>): JointModule {
  const s = j.slide!;
  const rail = s.form === 'rail';
  const d = s.drive;
  const axis = v3(j.axis), side = v3(s.side);
  const [b0, b1] = s.bar;
  const [g0, g1] = s.guide;
  const length = g1 - g0;
  const frame = () => axisFrame(axis, side);
  const key: Keyway | undefined = d ? { u: s.r + d.rack + gap * 0.8, w: d.rackWidth + gap * 0.8 } : undefined;

  // Into the seat's half gap, so the bar stands on its seat.
  const [y0, y1] = rail ? (s.foot ? [b0, b1 + gap / 2] : [b0 - gap / 2, b1]) : [b0, b1 + gap / 2];
  const bar = frame();
  bar.userData.module = owner;
  // A tube, so a section shows its wall; plugged, so its ends are closed.
  const tube = s.r * 0.72;
  const mesh = part(s.square ? collarGeometry(true, tube, s.r, y0, y1) : lathe(hollowCylinder(s.r, tube, y0, y1, s.r * 0.03), 48), mats, 'steel', { label: rail ? 'Rail' : 'Quill', layer: 'structure' });
  if (s.paint) coat(mesh, mats, named[s.paint]);
  const plug = (a: number, b: number) => {
    const m = part(s.square ? block(tube * 2, b - a, tube * 2, 0).translate(0, (a + b) / 2, 0) : lathe(solidCylinder(tube, a, b), 32), mats, 'alu', { label: 'Bar plug', layer: 'structure' });
    if (s.paint) coat(m, mats, named[s.paint]);
    return m;
  };
  const plugged = Math.min(s.r * 0.3, 0.008);
  bar.add(mesh, plug(y0 + 0.0003, y0 + plugged), plug(y1 - plugged, y1 - 0.0003), s.square ? hullBox(s.r * 2, y1 - y0, s.r * 2, new THREE.Vector3(0, (y0 + y1) / 2, 0)) : hullCylinder(s.r, y0, y1));

  if (d) {
    const face = s.square ? s.r : s.r * 0.86;
    const top = s.r + d.rack;
    const ends = plugged * 0.5;
    bar.add(
      part(rackGeometry(y0 + ends, y1 - ends, face, top, d.rackWidth), mats, 'magnet', { label: 'Rack', layer: 'drive' }),
      hullBox(top - face, y1 - y0 - ends * 2, d.rackWidth * 2, new THREE.Vector3((face + top) / 2, (y0 + y1) / 2, 0)),
    );
  }

  if (rail) {
    // Past the carriage's furthest reach, on the rail's free end.
    const [dir, end] = s.foot ? [-1, b0] : [1, b1];
    const cap = Math.max(s.r * 0.4, 0.004);
    const w = (d ? Math.max(s.r * 1.2, key!.u + 0.002) : s.r * 1.2);
    const [c0, c1] = [Math.min(end, end + dir * cap), Math.max(end, end + dir * cap)];
    bar.add(
      part(s.square ? block(w * 2, cap, w * 2, cap * 0.1).translate(0, (c0 + c1) / 2, 0) : lathe(solidCylinder(w, c0, c1, cap * 0.1), 48), mats, 'alu', { label: 'Rail end', layer: 'structure' }),
      s.square ? hullBox(w * 2, cap, w * 2, new THREE.Vector3(0, (c0 + c1) / 2, 0)) : hullCylinder(w, c0, c1),
    );
  }

  const guide = frame();
  const inner = s.r + Math.min(gap * 0.3, 0.0004);
  const room = s.outer - wall - 0.001;
  const collar = (a: number, b: number, outer: number, role: MaterialRole, label: string, layer: 'bearing' | 'drive') =>
    part(collarGeometry(s.square, inner, outer, a, b, key), mats, role, { label, layer });
  const bearing = length * 0.16;
  const bearingR = Math.min(s.r * 1.45, room);
  if (bearingR > Math.max(inner, key?.u ?? 0) + 0.0005) guide.add(
    collar(g0 + wall + 0.0002, g0 + wall + bearing, bearingR, 'steel', 'Slide bearing', 'bearing'),
    collar(g1 - wall - bearing, g1 - wall - 0.0002, bearingR, 'steel', 'Slide bearing', 'bearing'),
  );
  if (d) guide.add(driveTrain(mats, d, s.outer * 2.2 + d.motor * 2));
  else if (Math.min(s.r * 1.8, room) > inner + 0.0005) guide.add(collar((g0 + g1) / 2 - length * 0.14, (g0 + g1) / 2 + length * 0.14, Math.min(s.r * 1.8, room), 'brass', 'Drive nut', 'drive'));

  const ringIn = s.r * 1.15;
  const load = part(collarGeometry(s.square, ringIn, Math.max(ringIn * 1.08, (key?.u ?? 0) + 0.001), g1, g1 + 0.0008, key), mats, 'accent', { label: 'Load ring', layer: 'sensor' });
  const accent = mats.get('accent');
  load.material = new LoadGlow({ color: '#26282c', roughness: accent.roughness, emissive: accent.emissive });
  guide.add(load);

  if (s.cut) bar.userData.cut = guide.userData.cut = s.cut;
  const [s0, s1] = [new THREE.Group(), new THREE.Group()];
  (rail ? s0 : s1).add(bar);
  (rail ? s1 : s0).add(guide);
  return { stages: [s0, s1], exit: () => s.outer, indicators: [load], size: s.opens / 1.3 };
}
