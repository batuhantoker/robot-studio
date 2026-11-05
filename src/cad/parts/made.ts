/** Parts drawn as they are made, not cast: off a lathe, cut from plate, or extruded, each with a hull of its own. */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MadeDesign, OutlinePoint, PaintDesign } from '../../core/robot/schema/design';
import { hullBox, hullCylinder } from '../common/hull';
import { lathe } from '../common/lathe';
import { axisFrame, v3 } from '../common/orient';
import { part, tag } from '../common/part';
import type { MaterialSet } from '../materials/library';
import { coat } from './castings/casting';

const TAU = 2 * Math.PI;
/** Length of a chord along an outline's arcs (m). */
const CHORD = 0.0016;
/** T-slot: half the opening, its lips, half the cavity, how deep it goes, and the corner's chamfer. */
const SLOT = { open: 0.0041, lip: 0.0035, cavity: 0.0105, deep: 0.0125, corner: 0.0016 };
const MODULE = 0.04;

/** toCreasedNormals welds on a 1/100-unit grid, a whole centimetre in metres: weld in millimetres instead. */
const creased = (g: THREE.BufferGeometry, angle = Math.PI / 7) => toCreasedNormals(g.scale(1000, 1000, 1000), angle).scale(0.001, 0.001, 0.001);

export function outlinePoints(o: OutlinePoint[]): THREE.Vector2[] {
  return o.flatMap(([x, y, r], i) => {
    const [px, py] = o[(i + o.length - 1) % o.length];
    if (!r) return [new THREE.Vector2(x, y)];
    const chord = Math.hypot(x - px, y - py), R = Math.abs(r), way = Math.sign(r);
    const rise = Math.sqrt(Math.max(R * R - chord * chord / 4, 0));
    const cx = (px + x) / 2 - (way * rise * (y - py)) / chord, cy = (py + y) / 2 + (way * rise * (x - px)) / chord;
    const from = Math.atan2(py - cy, px - cx);
    let sweep = Math.atan2(y - cy, x - cx) - from;
    while (way * sweep <= 0) sweep += way * TAU;
    const steps = Math.max(4, Math.ceil((Math.abs(sweep) * R) / CHORD));
    return Array.from({ length: steps }, (_, k) => {
      const a = from + (sweep * (k + 1)) / steps;
      return new THREE.Vector2(cx + R * Math.cos(a), cy + R * Math.sin(a));
    });
  });
}

function plate(d: Extract<MadeDesign, { sheet: unknown }>): THREE.BufferGeometry {
  const shape = new THREE.Shape(outlinePoints(d.outline));
  for (const [x, y, r] of d.holes ?? []) shape.holes.push(new THREE.Path().absarc(x, y, r, 0, TAU, true));
  const bevel = Math.min(d.bevel ?? 0, d.thick / 3);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d.thick - 2 * bevel, curveSegments: 64, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1,
  });
  return creased(g.translate(0, 0, bevel));
}

/** Round a `width` by `height` section, one slot per module of each face. */
function tSlot(width: number, height: number): THREE.Shape {
  const pts: THREE.Vector2[] = [];
  const face = (from: THREE.Vector2, to: THREE.Vector2) => {
    const along = to.clone().sub(from), span = along.length(), t = along.clone().normalize(), n = new THREE.Vector2(-t.y, t.x);
    const at = (s: number, d: number) => from.clone().addScaledVector(t, s).addScaledVector(n, d);
    const { open, lip, cavity, deep, corner } = SLOT;
    pts.push(at(corner, 0));
    for (let m = 0; m < Math.round(span / MODULE); m++) {
      const c = (m + 0.5) * MODULE;
      pts.push(at(c - open, 0), at(c - open, lip), at(c - cavity, lip), at(c - cavity, deep - 0.004), at(c - 0.004, deep),
        at(c + 0.004, deep), at(c + cavity, deep - 0.004), at(c + cavity, lip), at(c + open, lip), at(c + open, 0));
    }
    pts.push(at(span - corner, 0));
  };
  const [x, y] = [width / 2, height / 2];
  const v = (a: number, b: number) => new THREE.Vector2(a, b);
  face(v(-x, -y), v(x, -y));
  face(v(x, -y), v(x, y));
  face(v(x, y), v(-x, y));
  face(v(-x, y), v(-x, -y));
  const shape = new THREE.Shape(pts);
  for (let i = 0; i < Math.round(width / MODULE); i++) for (let j = 0; j < Math.round(height / MODULE); j++) {
    shape.holes.push(new THREE.Path().absarc(-x + (i + 0.5) * MODULE, -y + (j + 0.5) * MODULE, 0.0034, 0, TAU, true));
  }
  return shape;
}

/** Shears each end of an extrusion along its width, so it meets what it butts against. */
function mitred(g: THREE.BufferGeometry, length: number, [start, end]: [number, number]): void {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + p.getX(i) * (p.getZ(i) < length / 2 ? start : end));
}

function socketHeads(mats: MaterialSet, d: Extract<MadeDesign, { screws: unknown }>): THREE.InstancedMesh {
  const r = d.head, h = 1.3 * r;
  const head = lathe([[0, 0], [r, 0], [r, 0.92 * h], [0.9 * r, h], [0.56 * r, h], [0.5 * r, 0.5 * h], [0, 0.5 * h]], 20);
  const mesh = new THREE.InstancedMesh(head, mats.get('steel'), d.count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < d.count; i++) {
    const a = (i / d.count) * TAU + (d.phase ?? 0);
    mesh.setMatrixAt(i, m.makeTranslation(d.r * Math.cos(a), 0, d.r * Math.sin(a)));
  }
  mesh.castShadow = true;
  return mesh;
}

function made(mats: MaterialSet, d: MadeDesign, named: Record<string, PaintDesign>): THREE.Object3D {
  const opts = { label: d.label, layer: d.layer ?? 'structure' };
  const paintOn = (m: THREE.Mesh) => (coat(m, mats, named[d.paint ?? '']), m);
  if ('turned' in d) {
    const m = paintOn(part(lathe(d.profile, 96), mats, 'alu', opts));
    m.quaternion.copy(axisFrame(v3(d.axis)).quaternion);
    m.position.set(...d.turned);
    const along = d.profile.map((p) => p[1]);
    if (d.hull !== false) m.add(hullCylinder(Math.max(...d.profile.map((p) => p[0])), Math.min(...along), Math.max(...along)));
    return m;
  }
  if ('sheet' in d) {
    const m = paintOn(part(plate(d), mats, 'alu', opts));
    const x = v3(d.x).normalize(), n = v3(d.normal).normalize(), y = new THREE.Vector3().crossVectors(n, x);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
    m.position.set(...d.sheet);
    if (d.hull !== false) for (const box of hullSlices(d)) m.add(box);
    return m;
  }
  if ('extrusion' in d) {
    const [a, b] = d.extrusion.map(v3), length = a.distanceTo(b);
    const z = b.clone().sub(a).normalize(), up = v3(d.up), y = up.addScaledVector(z, -up.dot(z)).normalize(), x = new THREE.Vector3().crossVectors(y, z);
    const g = new THREE.ExtrudeGeometry(tSlot(d.width, d.height), { depth: length, bevelEnabled: false });
    if (d.mitre) mitred(g, length, d.mitre);
    const m = paintOn(part(creased(g, Math.PI / 5), mats, 'alu', opts));
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    m.position.copy(a);
    if (d.hull !== false) m.add(hullBox(d.width, d.height, length, new THREE.Vector3(0, 0, length / 2)));
    if (d.caps) {
      for (const at of [-0.0015, length + 0.0015]) {
        const cap = part(new THREE.BoxGeometry(d.width - 0.001, d.height - 0.001, 0.003), mats, 'rubber', { label: 'End cap', layer: 'structure' });
        cap.position.z = at;
        m.add(cap);
      }
    }
    return m;
  }
  const m = socketHeads(mats, d);
  tag(m, { ...opts, layer: 'fastener' }, 'steel');
  m.quaternion.copy(axisFrame(v3(d.axis)).quaternion);
  m.position.set(...d.screws);
  return m;
}

/** A plate as boxes along its longer side, each only as wide as the plate is there: a tapered link is not its bounding box. */
function hullSlices(d: Extract<MadeDesign, { sheet: unknown }>): THREE.Object3D[] {
  const pts = outlinePoints(d.outline), xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const long = y1 - y0 >= x1 - x0 ? 'y' : 'x', short = long === 'y' ? 'x' : 'y';
  const [lo, hi] = long === 'y' ? [y0, y1] : [x0, x1];
  const n = Math.min(10, Math.max(1, Math.round((hi - lo) / (0.8 * Math.min(x1 - x0, y1 - y0)))));
  const cross = (s: number) => {
    const at: number[] = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      if ((p[long] - s) * (q[long] - s) <= 0 && p[long] !== q[long]) at.push(p[short] + ((q[short] - p[short]) * (s - p[long])) / (q[long] - p[long]));
    });
    return at;
  };
  return Array.from({ length: n }, (_, i) => {
    const a = lo + ((hi - lo) * i) / n, b = lo + ((hi - lo) * (i + 1)) / n;
    const edges = [a + 1e-6, (a + b) / 2, b - 1e-6].flatMap(cross);
    if (!edges.length) return null;
    const [l, r] = [Math.min(...edges), Math.max(...edges)];
    const [w, h] = long === 'y' ? [r - l, b - a] : [b - a, r - l];
    const c = new THREE.Vector3(long === 'y' ? (l + r) / 2 : (a + b) / 2, long === 'y' ? (a + b) / 2 : (l + r) / 2, d.thick / 2);
    return hullBox(w, h, d.thick, c);
  }).filter((o): o is THREE.Object3D => !!o);
}

/** All of them in the frame of the body that holds them. */
export function madeParts(mats: MaterialSet, items: MadeDesign[], named: Record<string, PaintDesign>): THREE.Group {
  const g = new THREE.Group();
  for (const d of items) {
    const unit = made(mats, d, named);
    const meta = unit.userData.part as { explode: THREE.Vector3 } | undefined;
    if (meta && d.opens) meta.explode.copy(v3(d.opens));
    g.add(unit);
  }
  return g;
}
