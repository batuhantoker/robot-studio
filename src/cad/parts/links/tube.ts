/** Structural link: an aluminium tube between joint housings, clamped collars, and a cable run. */
import * as THREE from 'three';
import { hollowCylinder, lathe } from '../../common/lathe';
import { axisFrame } from '../../common/orient';
import { part } from '../../common/part';
import type { MaterialSet } from '../../materials/library';

export interface TubeOptions {
  mats: MaterialSet;
  /** Link vector in the link frame. */
  offset: THREE.Vector3;
  radius: number;
  startTrim: number;
  endTrim: number;
}

function cable(length: number, r: number, mats: MaterialSet, y0: number, y1: number): THREE.Mesh {
  const sag = Math.min(length * 0.06, r * 1.5);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(r * 1.25, y0, 0),
    new THREE.Vector3(r * 1.25 + sag, (y0 + y1) / 2, 0),
    new THREE.Vector3(r * 1.25, y1, 0),
  ]);
  return part(new THREE.TubeGeometry(curve, 32, r * 0.22, 10), mats, 'rubber', {
    label: 'Cable harness', layer: 'cable', explode: new THREE.Vector3(r * 2.5, 0, 0),
  });
}

export function buildTube({ mats, offset, radius, startTrim, endTrim }: TubeOptions): THREE.Group | null {
  const length = offset.length();
  const [y0, y1] = [startTrim * 0.92, length - endTrim * 0.92];
  if (length < 1e-9 || y1 - y0 < radius * 0.6) return null;
  const r = radius * 1.15;
  const frame = axisFrame(offset, new THREE.Vector3(0, 0, 1).cross(offset).lengthSq() > 1e-12 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0));
  const collar = (y: number, dir: number) =>
    part(lathe(hollowCylinder(r * 1.22, r * 0.98, y - r * 0.35, y + r * 0.35, r * 0.06)), mats, 'cap', {
      label: 'Clamp collar', layer: 'fastener', explode: new THREE.Vector3(0, dir * r * 1.2, 0),
    });
  frame.add(
    part(lathe(hollowCylinder(r, r * 0.82, y0, y1, r * 0.04)), mats, 'alu', { label: 'Link tube', layer: 'structure' }),
    collar(y0 + r * 0.35, -1),
    collar(y1 - r * 0.35, 1),
  );
  if (y1 - y0 > r * 4) {
    frame.add(cable(y1 - y0, r, mats, y0 + r * 0.9, y1 - r * 0.9));
    for (const t of [0.33, 0.66]) {
      const y = y0 + (y1 - y0) * t;
      frame.add(part(new THREE.TorusGeometry(r * 0.3, r * 0.06, 8, 20).rotateX(Math.PI / 2).translate(r * 1.25, y, 0), mats, 'cap', {
        label: 'Cable clip', layer: 'cable', explode: new THREE.Vector3(r * 2.5, 0, 0),
      }));
    }
  }
  const g = new THREE.Group();
  g.add(frame);
  return g;
}
