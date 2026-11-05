/** A mecanum wheel: two star plates holding long barrel rollers set at 45 degrees to the axle, with open gaps between them. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullPin } from '../../common/hull';
import { type Profile, lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import type { MaterialSet } from '../../materials/library';

const ROLLERS = 8;

/** A barrel whose outline follows the wheel's own circle, so the wheel rolls round. */
function rollerProfile(r: number, rollerR: number, length: number): Profile {
  const n = 8;
  const out: Profile = [[0, -length / 2]];
  for (let i = 0; i <= n; i++) {
    const y = -length / 2 + (length * i) / n;
    // Set at 45 degrees, the barrel's length covers the wheel's circle at half the curvature.
    out.push([rollerR - (y * y) / (4 * r), y]);
  }
  out.push([0, length / 2]);
  return out;
}

/** One lobe per roller end, turned by `turn` so each lobe meets its roller where it leans to on this side. */
function starPlate(lobe: number, valley: number, turn: number, y0: number, y1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const n = ROLLERS * 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = valley + (lobe - valley) * (0.5 + 0.5 * Math.cos(ROLLERS * a)) ** 2;
    // The plate is drawn in x, y and laid into x, z, which turns angles the other way.
    const [x, y] = [r * Math.cos(-a - turn), r * Math.sin(-a - turn)];
    if (i) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, y0, 0);
}

/** Local y is the axle, reaching to `axle` along it. `hand` is which way the rollers lean: the diagonal wheels of a base match. */
export function mecanumWheel(mats: MaterialSet, r: number, width: number, hand: 1 | -1, axle: number): THREE.Group {
  const g = new THREE.Group();
  const rollerR = r * 0.32;
  const length = width * 1.38;
  const barrel = lathe(rollerProfile(r, rollerR, length), 18);
  const y = new THREE.Vector3(0, 1, 0);
  const rollers = Array.from({ length: ROLLERS }, (_, i) => {
    const a = (i / ROLLERS) * Math.PI * 2;
    const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const tangent = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const along = tangent.multiplyScalar(Math.SQRT1_2).addScaledVector(y, hand * Math.SQRT1_2);
    const q = new THREE.Quaternion().setFromUnitVectors(y, along);
    const at = radial.multiplyScalar(r - rollerR);
    return barrel.clone().applyMatrix4(new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1)));
  });
  const hub = r * 0.34;
  const lean = Math.atan2((length / 2) * Math.SQRT1_2, r - rollerR);
  const thick = width * 0.09;
  const reach = Math.sign(axle) * width * 0.4;
  g.add(
    part(mergeGeometries(rollers)!, mats, 'rubber', { label: 'Mecanum rollers', layer: 'structure' }),
    part(lathe(solidCylinder(hub, -width * 0.4, width * 0.4, hub * 0.06), 40), mats, 'cap', { label: 'Wheel hub', layer: 'structure' }),
    ...[-1, 1].map((s) => part(starPlate(r * 0.86, hub * 1.1, s * hand * lean, s > 0 ? width * 0.42 : -width * 0.42 - thick, s > 0 ? width * 0.42 + thick : -width * 0.42), mats, 'cap', { label: 'Star plate', layer: 'structure' })),
    part(lathe(solidCylinder(hub * 0.5, Math.min(reach, axle), Math.max(reach, axle)), 24), mats, 'steel', { label: 'Axle', layer: 'drive' }),
    hullPin(r, width, 'y'),
  );
  return g;
}
