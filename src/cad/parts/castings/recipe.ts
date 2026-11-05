/** A body's solid: bulges and seats at its two ends, a neck between them, cut back flat at every interface. */
import { type Vec3, add, cross, dot, normalize, perpendicular, scale, sub } from '../../../core/math/linear/vec';
import type { BodyDesign, ShapeOp } from '../../../core/robot/schema/design';
import { type Field, type Solid, block, box, carve, carveSoft, common, cone, dome, drum, flip, half, joined, meet, merge, once, piece, revolved, sphere, tube, without } from './field';
import type { Joint, Plan, Side } from './plan';

/** Where a body ends on a joint. `n` points out of the body, across the interface. */
export interface End {
  kind: 'seat' | 'knuckle' | 'guide' | 'free';
  at: Vec3;
  n: Vec3;
  side: Side;
  bulge: Vec3;
  /** The knuckle across the interface. Round about the axis, so this is also what it sweeps at any angle. */
  across?: { bulge: Vec3; radius: number; depth: number };
  /** What a guide adds to the body, the hole the bar sweeps through it over its whole stroke, and how far it reaches. */
  sleeve?: { form: Field; bore: Solid; bound: Bound };
}

export interface Bound {
  at: Vec3;
  r: number;
  /** Tighter than the sphere, when the shape's own planes give it. */
  box?: [Vec3, Vec3];
}

export interface Cast {
  solid: Solid;
  lo: Vec3;
  hi: Vec3;
  /** Size that sets the fillets. */
  size: number;
  /** Widest fillet between its parts. */
  blend: number;
  /** Mesh cell. */
  cell: number;
  /** Clear space between the solid and `lo`..`hi`. */
  pad: number;
  /** What the hollow follows, when not the whole solid. */
  shell?: Field;
  /** Holes bars run through. */
  bores?: Field[];
}

const MOST_CELLS = 170;
/** Where a knuckle's flat face gives way to the neck, in radii from the axis. */
const BEND = 1.3;

export const cellFor = (size: number) => Math.min(0.0045, Math.max(0.0012, size / 17));

/** The six planes of a square prism `w` in half width, between two points on a slide's axis. */
function prism(j: Joint, y0: number, y1: number, w: number): Field[] {
  const a = add(j.origin, scale(j.axis, y0)), b = add(j.origin, scale(j.axis, y1));
  const u = normalize(j.slide!.side), v = cross(j.axis, u);
  return [...[u, scale(u, -1), v, scale(v, -1)].map((n) => half(add(a, scale(n, w)), n)), half(a, scale(j.axis, -1)), half(b, j.axis)];
}

/** The slot a rack runs through, from the bar's axis out along `side`. */
function keyway(j: Joint, y0: number, y1: number, u: number, w: number): Solid {
  const a = add(j.origin, scale(j.axis, y0)), b = add(j.origin, scale(j.axis, y1));
  const n = normalize(j.slide!.side), v = cross(j.axis, n);
  return meet(...[half(add(a, scale(n, u)), n), half(a, scale(n, -1)), half(add(a, scale(v, w)), v), half(sub(a, scale(v, w)), scale(v, -1)), half(a, scale(j.axis, -1)), half(b, j.axis)].map((f) => piece(f)));
}

function slideEnd(j: Joint, role: 'parent' | 'child', gap: number): End {
  const s = j.slide!;
  const on = (y: number) => add(j.origin, scale(j.axis, y));
  const side = j[role];
  if (role === (s.form === 'rail' ? 'parent' : 'child')) {
    const at = on(s.form === 'rail' ? s.bar[s.foot] : s.bar[1]);
    return { kind: 'seat', at, n: scale(j.axis, s.form === 'rail' && !s.foot ? 1 : -1), side, bulge: at };
  }
  const [g0, g1] = s.guide;
  const at = on((g0 + g1) / 2);
  const round = s.outer * 0.1;
  const sleeve = s.square ? block(prism(j, g0, g1, s.outer), round) : drum(on(g0), on(g1), s.outer, round);
  const d = s.drive;
  const pod = d && drum(add(on(d.span[0]), scale(s.side, d.wormAt)), add(on(d.span[1]), scale(s.side, d.wormAt)), d.pod, d.pod * 0.2);
  const form: Field = pod ? (x, y, z) => Math.min(sleeve(x, y, z), pod(x, y, z)) : sleeve;
  // A rail moves back through its carriage as the carriage goes forward; a quill sweeps through its guide as it is.
  const [lo, hi] = s.stroke;
  const [from, to] = s.form === 'rail' ? [s.bar[0] - hi, s.bar[1] - lo] : [s.bar[0] + lo, s.bar[1] + hi];
  const hole = s.square ? meet(...prism(j, from - gap, to + gap, s.r + gap).map((f) => piece(f))) : crispDrum(on(from - gap), on(to + gap), s.r + gap);
  const bore = d ? merge(hole, keyway(j, from - gap, to + gap, s.r + d.rack + gap, d.rackWidth + gap)) : hole;
  const reach = Math.hypot((g1 - g0) / 2, s.outer * (s.square ? Math.SQRT2 : 1));
  // The pod can run past the guide's own ends.
  const r = d ? Math.max(reach, Math.hypot(Math.max(Math.abs(d.span[0] - (g0 + g1) / 2), Math.abs(d.span[1] - (g0 + g1) / 2)), d.wormAt + d.pod)) : reach;
  return { kind: 'guide', at, n: j.axis, side, bulge: at, sleeve: { form, bore, bound: { at, r } } };
}

export const endOn = (j: Joint, role: 'parent' | 'child', gap = 0): End => {
  if (j.kind === 'slide') return slideEnd(j, role, gap);
  const side = j[role];
  const other = j[role === 'parent' ? 'child' : 'parent'];
  const n = role === 'parent' ? j.axis : scale(j.axis, -1);
  return {
    kind: j.kind === 'hinge' ? 'knuckle' : j.kind === 'roll' ? 'seat' : 'free',
    at: add(j.origin, scale(j.axis, j.plane)),
    n,
    side,
    bulge: add(j.origin, scale(j.axis, side.centre)),
    across: j.kind === 'hinge' ? { bulge: add(j.origin, scale(j.axis, other.centre)), radius: other.radius, depth: other.depth } : undefined,
  };
};

/** Radius of a body's section where it meets the interface. */
export function faceRadius(e: End): number {
  if (e.kind !== 'knuckle') return e.side.radius;
  const off = dot(sub(e.at, e.bulge), e.n) / e.side.depth;
  return e.side.radius * Math.sqrt(Math.max(0.04, 1 - off * off));
}

export const bodyEnds = (plan: Plan, k: number): End[] => {
  const ends: End[] = [];
  if (k >= 0 && plan.joints[k].kind !== 'virtual') ends.push(endOn(plan.joints[k], 'child', plan.gap));
  if (k + 1 < plan.joints.length) {
    if (!plan.joints[k + 1].slide?.free) ends.push(endOn(plan.joints[k + 1], 'parent', plan.gap));
  } else if (k >= 0 && !plan.bare) {
    const { at, normal, radius } = plan.flange;
    ends.push({ kind: 'seat', at, n: normal, side: { radius, depth: 0, centre: 0, waist: radius }, bulge: at });
  }
  return ends;
};

/** Away from the interface and towards the far end, square to the joint axis. */
function towards(e: End, far: Vec3): Vec3 {
  const d = sub(far, e.at);
  const w = sub(d, scale(e.n, dot(d, e.n)));
  return dot(w, w) > 1e-10 ? normalize(w) : perpendicular(e.n);
}

function anchor(e: End, far: Vec3, collar: number): { at: Vec3; r: number } {
  if (e.kind === 'guide') return { at: e.at, r: e.side.waist };
  if (e.kind !== 'knuckle') return { at: sub(e.at, scale(e.n, collar)), r: e.side.radius };
  const w = towards(e, far);
  return { at: add(add(e.at, scale(e.n, -e.side.depth * 0.3)), scale(w, e.side.radius * 0.82)), r: e.side.waist };
}

/** A flat-ended cylinder as three faces, so its rims stay true edges. `ends` scales their mesh cell: a shelf narrower than a cell falls between the triangles. */
export function crispDrum(a: Vec3, b: Vec3, r: number, ends = 1): Solid {
  const n = normalize(sub(b, a));
  return meet(piece(tube(a, n, r)), piece(half(a, scale(n, -1)), ends), piece(half(b, n), ends));
}

export function shapeSolid(op: ShapeOp, o: Vec3): { solid: Solid; bound: Bound } {
  const shape = bareShape(op, o);
  return op.above === undefined ? shape : { ...shape, solid: meet(shape.solid, piece(half(add(o, [0, 0, op.above]), [0, 0, -1]))) };
}

function bareShape(op: ShapeOp, o: Vec3): { solid: Solid; bound: Bound } {
  const at = (p: Vec3) => add(o, p);
  if ('sphere' in op) return { solid: piece(sphere(at(op.sphere), op.r)), bound: { at: at(op.sphere), r: op.r } };
  if ('cone' in op) {
    const [a, b] = op.cone.map(at);
    return { solid: piece(cone(a, b, op.r[0], op.r[1])), bound: { at: scale(add(a, b), 0.5), r: Math.hypot(...sub(a, b)) / 2 + Math.max(...op.r) } };
  }
  if ('drum' in op) {
    const [a, b] = op.drum.map(at);
    return { solid: op.round ? piece(drum(a, b, op.r, op.round)) : crispDrum(a, b, op.r, 0.35), bound: { at: scale(add(a, b), 0.5), r: Math.hypot(...sub(a, b)) / 2 + op.r } };
  }
  if ('dome' in op) return { solid: piece(dome(at(op.dome), op.axis, op.r, op.h)), bound: { at: at(op.dome), r: Math.max(op.r, op.h) } };
  if ('box' in op) return { solid: piece(box(at(op.box), op.size, op.round, op.axis)), bound: { at: at(op.box), r: Math.hypot(...op.size) } };
  if ('planes' in op) {
    const points = op.planes.map((p) => at(p.at));
    const centre = scale(points.reduce(add), 1 / points.length);
    const planes = op.planes.map((p) => half(at(p.at), p.normal));
    // Square to the axes, the planes are the box: a sphere round a long slab would cost the whole body its mesh cell.
    const face = (a: number, sign: 1 | -1) => op.planes.flatMap((p, i) => (normalize(p.normal)[a] * sign > 0.999 ? [points[i][a]] : []))[0];
    const [lo, hi] = [[0, 1, 2].map((a) => face(a, -1)), [0, 1, 2].map((a) => face(a, 1))];
    const box: [Vec3, Vec3] | undefined = [...lo, ...hi].every((v) => v !== undefined) ? [lo as Vec3, hi as Vec3] : undefined;
    return { solid: op.round ? piece(block(planes, op.round), 0.6) : meet(...planes.map((f) => piece(f))), bound: { at: centre, r: Math.max(...points.map((p) => Math.hypot(...sub(p, centre)))) * 1.5, box } };
  }
  const reach = Math.max(...op.outline.map(([r, h]) => Math.hypot(r, h)));
  return { solid: piece(revolved(at(op.revolve), op.axis, op.outline)), bound: { at: at(op.revolve), r: reach } };
}

/** The casting from `ends`; `origin` is what design points are relative to. */
export function castBody(ends: End[], origin: Vec3, design: BodyDesign | undefined, gap: number, foot: Field[] = [], footBounds: Bound[] = []): Cast | null {
  const parts: Field[] = [...foot];
  const bounds: Bound[] = [...footBounds];
  const size = design?.size ?? Math.max(...ends.map((e) => e.side.radius), 0);
  const collar = design?.collar ?? 0;
  for (const e of ends) {
    if (e.kind === 'knuckle') {
      parts.push(dome(e.bulge, e.n, e.side.radius, e.side.depth));
      bounds.push({ at: e.bulge, r: Math.max(e.side.radius, e.side.depth) });
    } else if (e.sleeve) {
      parts.push(e.sleeve.form);
      bounds.push(e.sleeve.bound);
    } else {
      bounds.push({ at: e.at, r: e.side.radius });
    }
  }
  if (ends.length === 2 && design?.neck !== false) {
    const [a, b] = [anchor(ends[0], ends[1].at, collar), anchor(ends[1], ends[0].at, collar)];
    const path = [a, ...(design?.spine ?? []).map((p) => ({ at: add(origin, p.at), r: p.r })), b];
    const legs = path.slice(1).map((p, i) => cone(path[i].at, p.at, path[i].r, p.r));
    const neck = legs.length > 1 ? joined(legs, size * 0.25) : legs[0];
    // A straight wall that is tangent to the neck's end sphere: a smooth union of the two would swell past the seat.
    // It also runs on past the interface, so its own end edge stays clear of the seam the plane cuts.
    const walls = ends.flatMap((e, i) => (e.kind === 'seat' && collar > 0 ? [drum(add(e.at, scale(e.n, size * 0.3)), i ? b.at : a.at, e.side.radius)] : []));
    parts.push((x, y, z) => {
      let d = neck(x, y, z);
      for (const w of walls) d = Math.min(d, w(x, y, z));
      return d;
    });
    bounds.push(...path);
  }
  const shapes = (design?.shapes ?? []).map((op) => ({ op, ...shapeSolid(op, origin) }));
  for (const { op, solid, bound } of shapes) {
    // A cut only takes away, so it says nothing about where the body reaches.
    if (!op.cut) bounds.push(bound);
    if (!op.cut && !op.crisp && !op.last) parts.push(solid.f);
  }
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const pad = size * 0.12 + 0.002;
  for (const { at, r, box: tight } of bounds) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], (tight ? tight[0][a] : at[a] - r) - pad);
    hi[a] = Math.max(hi[a], (tight ? tight[1][a] : at[a] + r) + pad);
  }
  // A big body must not buy its fine cell with a dense grid hundreds of megabytes large; a long slim one costs little.
  const cell = Math.max(design?.cell ?? cellFor(size), Math.cbrt((hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2])) / MOST_CELLS);
  const blend = design?.blend ?? size * 0.32;
  // A soft cut goes into the one smooth field, where it has no edge for a mesh or the ink overlay to find.
  let smooth: Field | null = parts.length ? joined(parts, blend) : null;
  for (const { op, solid: shape } of shapes) if (op.cut && op.soft && smooth) smooth = without(smooth, shape.f, op.blend ?? 0);
  let solid: Solid | null = smooth && piece(smooth);
  const host = shapes.find((s) => s.op.host);
  for (const { op, solid: shape } of shapes) {
    if (op.cut && !op.soft) {
      if (solid) solid = op.blend ? carveSoft(solid, shape, () => op.blend!) : carve(solid, shape);
    } else if (op.crisp && !op.last) {
      // A fillet this narrow is only a cell or two wide on the body's own mesh.
      solid = !solid ? shape : op.blend ? flip(carveSoft(flip(solid), shape, () => op.blend!, 0.4)) : merge(solid, shape);
    }
  }
  if (!solid) return null;
  let shell: Solid | undefined = host?.solid;
  // A draft changes the mesh, not the shape: fillets scaled by its coarse cell would round away real contact.
  const edge = (design?.draft ? cellFor(size) : cell) * 3;
  for (const e of ends) {
    const face = sub(e.at, scale(e.n, gap / 2));
    if (e.kind === 'knuckle') {
      const far = ends.find((o) => o !== e)?.at ?? add(e.at, perpendicular(e.n));
      const w = towards(e, far);
      const bend = add(e.at, scale(w, e.side.radius * BEND));
      const m = sub(scale(e.n, 0.62), scale(w, 0.78));
      const rim = faceRadius(e) * 1.02, wide = rim + e.side.radius * 0.26;
      const axisField = tube(e.at, e.n, 0);
      // True edge round the interface disc, fading into a soft shoulder down the neck.
      const soft: Field = (x, y, z) => {
        const t = Math.min(1, Math.max(0, (axisField(x, y, z) - rim) / (wide - rim)));
        return edge * t * t * (3 - 2 * t);
      };
      const { fork } = e.side;
      if (!fork) solid = carveSoft(solid, piece(common(half(face, scale(e.n, -1)), half(bend, scale(m, -1)), e.side.radius * 0.5)), soft);
      // The corner above is wide and lifts off the plane short of the bend; inside the rim the face stays truly flat.
      solid = carve(solid, meet(piece(half(face, scale(e.n, -1))), piece(tube(e.at, e.n, rim)), ...(fork ? [piece(half(add(e.at, scale(e.n, fork)), e.n))] : [])));
      // Only the half beyond the interface: the other half of that ellipsoid is this body's own knuckle.
      const { bulge, radius, depth } = e.across!;
      // A saddle rather than a hard-rimmed dish, softening with height so the blend cannot reach the flat face below.
      const beyondFace = half(e.at, e.n);
      const rising: Field = (x, y, z) => edge * Math.min(1, Math.max(0, beyondFace(x, y, z) / (edge * 1.5)));
      solid = carveSoft(solid, meet(piece(dome(bulge, e.n, radius + gap, depth + gap)), piece(half(e.at, scale(e.n, -1)))), rising);
    } else if (e.kind === 'seat') {
      solid = meet(solid, piece(half(face, e.n)));
      if (shell) shell = meet(shell, piece(half(face, e.n)));
    }
  }
  for (const { op, solid: shape } of shapes) if (op.last) solid = merge(solid, shape);
  // Only the walls are bored: the bar crosses the hollow in the open, where a bearing can hold it.
  const bores = ends.flatMap((e) => (e.sleeve ? [e.sleeve.bore] : []));
  if (bores.length) {
    shell ??= { ...solid, f: once(solid.f) };
    solid = carve(solid, ...bores);
  }
  return { solid: { ...solid, f: once(solid.f) }, lo, hi, size, blend, cell, pad, shell: shell?.f, bores: bores.map((b) => b.f) };
}
