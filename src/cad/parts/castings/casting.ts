/**
 * Meshes a body's solid into parts: the hollow casting, the panels in its wall, and the hull that stands for it.
 * Each keeps its field in `userData.field`, in zero-pose coordinates: the exact answer to what is inside it.
 */
import * as THREE from 'three';
import { type Vec3, add, normalize, scale } from '../../../core/math/linear/vec';
import type { BodyDesign, CoverDesign, PaintDesign } from '../../../core/robot/schema/design';
import { boltCircle } from '../../common/fasteners';
import { hullSphere } from '../../common/hull';
import { lathe } from '../../common/lathe';
import { part, partOf } from '../../common/part';
import type { MaterialClass } from '../../materials/classes/types';
import type { MaterialSet } from '../../materials/library';
import { mecanumWheel } from '../wheels/mecanum';
import type { BakeSlot } from './bake';
import { surfaceOf } from './crisp';
import { insideParts } from './inside';
import { type Solid, carve, flip, half, inset, meet, piece, tube } from './field';
import type { Surface } from './net';
import type { Cast } from './recipe';
import { coverSurface } from './spheres';

/** Matte: any sheen would pick out the coarse mesh of an inner wall as a grid. */
const INTERIOR: PaintDesign = { color: '#2b2f36', finish: 'rubber', roughness: 1, clearcoat: 0 };

/** Clear line around a panel, the only seam it shows. */
const REVEAL = 0.0005;

export const wallOf = (design: BodyDesign | undefined, size: number) => design?.wall ?? Math.min(0.007, size * 0.12);

function geometryOf(s: Surface, shift: Vec3): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(s.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(s.normal, 3));
  g.setIndex(new THREE.BufferAttribute(s.index, 1));
  return g.translate(shift[0], shift[1], shift[2]);
}

function joinSurfaces(list: Surface[]): Surface {
  const count = list.reduce((c, s) => c + s.position.length, 0);
  const position = new Float32Array(count), normal = new Float32Array(count);
  let at = 0;
  for (const s of list) {
    position.set(s.position, at);
    normal.set(s.normal, at);
    at += s.position.length;
  }
  return { position, normal, index: new Uint32Array(0) };
}

const rgbOf = (hex: string) => {
  const c = new THREE.Color();
  c.setStyle(hex, THREE.SRGBColorSpace);
  c.convertLinearToSRGB();
  return [c.r, c.g, c.b, 1];
};

/** Applies a design paint to a part; the material class keeps teardown and the Materials look honest. */
export function coat(mesh: THREE.Mesh, mats: MaterialSet, paint: PaintDesign | undefined): void {
  if (!paint) return;
  const cls: MaterialClass = paint.finish ?? 'paint';
  const m = mats.finish(cls, rgbOf(paint.color));
  if (paint.roughness !== undefined) m.roughness = paint.roughness;
  if (paint.clearcoat !== undefined) m.clearcoat = paint.clearcoat;
  mesh.material = m;
  (mesh.userData.part as { material: MaterialClass }).material = cls;
}

/** A washer and a round socket-head screw, seated with its underside at y = 0. */
function socketScrew(mats: MaterialSet, size: number, label: string): THREE.Mesh {
  const s = size;
  return part(lathe([[0, s * 0.62], [s * 0.42, s * 0.62], [s * 0.46, s * 0.86], [s * 0.74, s * 0.86], [s * 0.8, s * 0.8], [s * 0.8, s * 0.2], [s * 1.3, s * 0.2], [s * 1.3, 0], [0, 0]], 32), mats, 'steel', { label, layer: 'fastener' });
}

/** The part of the wall beyond a cover's plane, or within `width` of it; `grow` moves its boundary outward. */
function coverRegion(c: CoverDesign, origin: Vec3, grow: number): Solid {
  const at = add(origin, c.at);
  const n = normalize(c.normal);
  const from = piece(half(add(at, scale(n, -grow)), scale(n, -1)));
  const limits = (c.within ?? []).map((p) => piece(half(add(add(origin, p.at), scale(normalize(p.normal), grow)), p.normal)));
  const round = c.radius ? [piece(tube(at, n, c.radius + grow))] : [];
  return meet(from, ...(c.width ? [piece(half(add(at, scale(n, c.width + grow)), n))] : []), ...limits, ...round);
}

export interface CastPaint {
  body: PaintDesign | undefined;
  named: Record<string, PaintDesign>;
}

/**
 * Everything is built in zero-pose coordinates, then shifted by `-origin` into the body's own frame.
 * `openings` are what the drives pass through; they go through the wall and nowhere else.
 */
export function buildCasting(mats: MaterialSet, cast: Cast, solid: Solid, openings: Solid[], normals: Vec3[], origin: Vec3, design: BodyDesign | undefined, label: string, paint: CastPaint, slot: BakeSlot = {}): THREE.Group | null {
  const h = cast.cell;
  const baked = slot.use;
  const { lo, hi, blend } = cast;
  const covers = design?.covers ?? [];
  // A cover is that stretch of the wall itself: off the arm, it leaves the casting open behind it.
  const cavity = inset(cast.shell ?? solid.f, wallOf(design, cast.size));
  const hollow: Solid = { f: cavity, faces: [{ f: cavity, coarse: 1.8, inner: true }] };
  const wall = carve(meet(solid, flip(hollow)), ...openings);
  const shift = scale(origin, -1);
  const g = new THREE.Group();
  if (design?.cut) g.userData.cut = design.cut;
  const cast0 = carve(wall, ...covers.map((c) => coverRegion(c, origin, REVEAL)));
  const body = baked?.body ?? surfaceOf(cast0, lo, hi, h, blend);
  if (!body.index.length) return null;
  const drawn = [body];
  // The hull samples these before geometryOf moves them into the body's frame.
  const pieces = covers.map((c) => meet(wall, coverRegion(c, origin, 0)));
  const panels = baked?.panels ?? pieces.map((p) => surfaceOf(p, lo, hi, h, blend));
  drawn.push(...panels);
  const balls = baked?.balls ?? coverSurface(solid.f, joinSurfaces(drawn), { tolerance: 0.0025, smallest: design?.draft ? h * 0.3 : h, largest: cast.size * 1.6, most: design?.spheres ?? 72, faces: normals, bores: cast.bores, quick: design?.draft, stray: design?.draft ? h * 0.5 : undefined });
  const inside = baked?.inside ?? surfaceOf(cast0, lo, hi, h, blend, true);
  const backs = baked?.backs ?? pieces.map((p) => surfaceOf(p, lo, hi, h, blend, true));
  slot.keep?.({ body, panels, inside, backs, balls });
  const mesh = part(geometryOf(body, shift), mats, 'shell', { label, layer: 'housing', material: paint.body?.finish ?? 'paint' });
  coat(mesh, mats, paint.body);
  mesh.userData.field = cast0.f;
  g.add(mesh);
  if (inside.index.length) {
    // Raw, dark and unpainted: the cut face has to stand out against it, and a cut through the wall stays the casting's own colour.
    const raw = part(geometryOf(inside, shift), mats, 'cap', { label: `${label} interior`, layer: 'housing' });
    coat(raw, mats, INTERIOR);
    raw.userData.capAs = mesh;
    g.add(raw);
  }
  covers.forEach((c, i) => {
    const s = panels[i];
    if (!s.index.length) return;
    const m = part(geometryOf(s, shift), mats, 'shell', { label: c.label, layer: c.trim ? 'structure' : 'housing', explode: new THREE.Vector3(...normalize(c.normal)).multiplyScalar(c.opens ?? cast.size * 0.5) });
    coat(m, mats, paint.named[c.paint]);
    m.userData.field = pieces[i].f;
    g.add(m);
    const back = backs[i];
    if (back.index.length) {
      const raw = part(geometryOf(back, shift), mats, 'cap', { label: `${c.label} interior`, layer: c.trim ? 'structure' : 'housing', explode: partOf(m)!.explode.clone() });
      coat(raw, mats, INTERIOR);
      raw.userData.capAs = m;
      g.add(raw);
    }
  });
  if (design?.bolts) {
    const { count = 0, radius = 0, size, z = 0, angle = 0, seats } = design.bolts;
    const holder = new THREE.Group();
    if (seats) {
      for (const { at, facing } of seats) {
        const screw = socketScrew(mats, size, `${label} bolt`);
        screw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...normalize(facing)));
        screw.position.set(...at);
        holder.add(screw);
      }
    } else {
      holder.position.z = z;
      const bolts = boltCircle(mats, count, radius, size, 0, 1, { label: `${label} bolts`, layer: 'fastener' });
      bolts.rotation.x = Math.PI / 2;
      holder.rotation.z = ((angle - 180 / count) * Math.PI) / 180;
      holder.add(bolts);
    }
    g.add(holder);
  }
  for (const { at, r, width, hand, axle, rollers, hub, opens = 0 } of design?.wheels ?? []) {
    const wheel = mecanumWheel(mats, r, width, hand, axle);
    wheel.position.set(...at);
    // The section passes between the wheels; cut, they would only leave a floating chassis.
    wheel.userData.cut = 1;
    for (const o of wheel.children) {
      const meta = partOf(o);
      if (!meta) continue;
      meta.explode.set(0, -Math.sign(axle) * opens, 0);
      if (meta.label === 'Mecanum rollers') coat(o as THREE.Mesh, mats, paint.named[rollers ?? '']);
      else if (meta.label !== 'Axle') coat(o as THREE.Mesh, mats, paint.named[hub ?? '']);
    }
    g.add(wheel);
  }
  if (design?.inside) g.add(insideParts(mats, design.inside, paint.named));
  for (const b of balls) g.add(hullSphere(b.r, new THREE.Vector3(...add(b.at, shift))));
  return g;
}
