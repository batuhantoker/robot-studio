/** Signed distance fields, the solid model a casting is meshed from. Metres, negative inside, 1-Lipschitz unless noted. */
import { type Vec3, cross, dot, norm, normalize, perpendicular, sub } from '../../../core/math/linear/vec';

export type Field = (x: number, y: number, z: number) => number;

export const sphere = ([cx, cy, cz]: Vec3, r: number): Field => (x, y, z) => {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
};

/** Everything on the negative side of a plane through `at`, `normal` pointing out. */
export function half(at: Vec3, normal: Vec3): Field {
  const [a, b, c] = normalize(normal);
  const d = dot(at, [a, b, c]);
  return (x, y, z) => a * x + b * y + c * z - d;
}

/** Sphere of `r1` at `a` swept into a sphere of `r2` at `b`: exact, after Quilez. */
export function cone(a: Vec3, b: Vec3, r1: number, r2: number): Field {
  const [bx, by, bz] = sub(b, a);
  const l2 = bx * bx + by * by + bz * bz;
  if (l2 < 1e-12) return sphere(a, Math.max(r1, r2));
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const k0 = Math.sign(rr) * rr * rr;
  return (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const t = px * bx + py * by + pz * bz;
    const u = t - l2;
    const qx = px * l2 - bx * t, qy = py * l2 - by * t, qz = pz * l2 - bz * t;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = t * t * l2, z2 = u * u * l2;
    const k = k0 * x2;
    if (Math.sign(u) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(t) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + t * rr) * il2 - r1;
  };
}

/** A flat-ended cylinder from `a` to `b` with edges rounded by `round`. */
export function drum(a: Vec3, b: Vec3, r: number, round = 0): Field {
  const d = sub(b, a);
  const len = norm(d);
  const [nx, ny, nz] = normalize(d);
  const [mx, my, mz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const c = Math.min(round, r * 0.95, len * 0.475);
  const [rr, hh] = [r - c, len / 2 - c];
  return (x, y, z) => {
    const px = x - mx, py = y - my, pz = z - mz;
    const t = px * nx + py * ny + pz * nz;
    const ax = Math.abs(t) - hh;
    const rad = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - t * t)) - rr;
    const ox = Math.max(rad, 0), oy = Math.max(ax, 0);
    return Math.min(Math.max(rad, ax), 0) + Math.sqrt(ox * ox + oy * oy) - c;
  };
}

/** An ellipsoid of revolution about `axis`: `r` across it, `h` along it. Bound, not exact. */
export function dome(at: Vec3, axis: Vec3, r: number, h: number): Field {
  const [nx, ny, nz] = normalize(axis);
  return (x, y, z) => {
    const px = x - at[0], py = y - at[1], pz = z - at[2];
    const t = px * nx + py * ny + pz * nz;
    const rad = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - t * t));
    const a = rad / r, b = t / h, c = a / r, d = b / h;
    const k0 = Math.sqrt(a * a + b * b);
    const k1 = Math.sqrt(c * c + d * d);
    return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(r, h);
  };
}

/** An endless cylinder through `at`, along `axis`. */
export function tube(at: Vec3, axis: Vec3, r: number): Field {
  const [nx, ny, nz] = normalize(axis);
  return (x, y, z) => {
    const px = x - at[0], py = y - at[1], pz = z - at[2];
    const t = px * nx + py * ny + pz * nz;
    return Math.sqrt(Math.max(0, px * px + py * py + pz * pz - t * t)) - r;
  };
}

/** A box with half sizes `size`, its z along `axis` when given, edges rounded by `round`. */
export function box(at: Vec3, size: Vec3, round = 0, axis: Vec3 = [0, 0, 1]): Field {
  const w = normalize(axis);
  const u: Vec3 = Math.abs(w[2]) > 0.999 ? [1, 0, 0] : perpendicular(w);
  const v = cross(w, u);
  const c = Math.min(round, ...size.map((s) => s * 0.95));
  const [hx, hy, hz] = size.map((s) => s - c);
  return (x, y, z) => {
    const px = x - at[0], py = y - at[1], pz = z - at[2];
    const qx = Math.abs(px * u[0] + py * u[1] + pz * u[2]) - hx;
    const qy = Math.abs(px * v[0] + py * v[1] + pz * v[2]) - hy;
    const qz = Math.abs(px * w[0] + py * w[1] + pz * w[2]) - hz;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - c;
  };
}

/** A turned surface from [radius, height] points rising up `axis`, smooth between them: no facets to band under light, and cheap to ask. */
export function revolved(at: Vec3, axis: Vec3, profile: [number, number][]): Field {
  const [nx, ny, nz] = normalize(axis);
  const n = profile.length;
  const slope = profile.map((_, i) => {
    const [a, b] = [profile[Math.max(0, i - 1)], profile[Math.min(n - 1, i + 1)]];
    return (b[0] - a[0]) / (b[1] - a[1] || 1);
  });
  const [h0, h1] = [profile[0][1], profile[n - 1][1]];
  return (x, y, z) => {
    const px = x - at[0], py = y - at[1], pz = z - at[2];
    const h = px * nx + py * ny + pz * nz;
    const r = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - h * h));
    const c = Math.min(h1, Math.max(h0, h));
    let i = 0;
    while (i < n - 2 && profile[i + 1][1] < c) i++;
    const [ra, ha] = profile[i], [rb, hb] = profile[i + 1];
    const w = hb - ha, t = (c - ha) / w, t2 = t * t, t3 = t2 * t;
    const R = (2 * t3 - 3 * t2 + 1) * ra + (t3 - 2 * t2 + t) * w * slope[i] + (3 * t2 - 2 * t3) * rb + (t3 - t2) * w * slope[i + 1];
    const m = ((6 * t2 - 6 * t) * ra + (6 * t - 6 * t2) * rb) / w + (3 * t2 - 4 * t + 1) * slope[i] + (3 * t2 - 2 * t) * slope[i + 1];
    return Math.max((r - R) / Math.sqrt(1 + m * m), h0 - h, h - h1);
  };
}

/** What lies inside every plane, every edge and corner rounded by the same `r`; the planes should meet near square. */
export function block(planes: Field[], r: number): Field {
  return (x, y, z) => {
    let out = 0, most = -Infinity;
    for (const f of planes) {
      const q = f(x, y, z) + r;
      if (q > 0) out += q * q;
      if (q > most) most = q;
    }
    return Math.sqrt(out) + Math.min(most, 0) - r;
  };
}

/** Polynomial smooth minimum; `k` is roughly the fillet's width. */
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export const joined = (parts: Field[], k: number): Field => (x, y, z) => {
  let d = parts[0](x, y, z);
  for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y, z), k);
  return d;
};

export const common = (a: Field, b: Field, k = 0): Field => (x, y, z) => smax(a(x, y, z), b(x, y, z), k);

export const without = (a: Field, b: Field, k = 0): Field => (x, y, z) => smax(a(x, y, z), -b(x, y, z), k);

export const inset = (a: Field, by: number): Field => (x, y, z) => a(x, y, z) + by;

/** `a` inside a box, whose faces lie at least `pad` clear of its solid; outside, a cheap bound that stays that far off. */
export function within(a: Field, lo: Vec3, hi: Vec3, pad: number): Field {
  return (x, y, z) => {
    const ox = Math.max(lo[0] - x, x - hi[0], 0), oy = Math.max(lo[1] - y, y - hi[1], 0), oz = Math.max(lo[2] - z, z - hi[2], 0);
    return ox + oy + oz > 0 ? pad + Math.sqrt(ox * ox + oy * oy + oz * oz) : a(x, y, z);
  };
}

/** One smooth piece of a solid's boundary, oriented outward. */
export interface Face {
  f: Field;
  /** Scales the mesh cell for this piece alone. */
  coarse?: number;
  /** Where the piece exists at all, negative inside; a fillet is only a strip of its field. */
  only?: Field;
  /** The inside of a hollow casting, drawn apart from its outside. */
  inner?: boolean;
}

/**
 * A solid kept as an expression of smooth pieces. `f` is the whole; meshing each face on its own and clipping it
 * where another takes over gives true edges, which a mesh of `f` could only stair-step or round off.
 */
export interface Solid {
  f: Field;
  faces: Face[];
}

export const piece = (f: Field, coarse?: number): Solid => ({ f, faces: [{ f, coarse }] });

const negate = (f: Field): Field => (x, y, z) => -f(x, y, z);

export const flip = (s: Solid): Solid => ({ f: negate(s.f), faces: s.faces.map((a) => ({ ...a, f: negate(a.f) })) });

export function meet(...parts: Solid[]): Solid {
  const fs = parts.map((p) => p.f);
  return {
    f: (x, y, z) => {
      let d = -Infinity;
      for (const f of fs) d = Math.max(d, f(x, y, z));
      return d;
    },
    faces: parts.flatMap((p) => p.faces),
  };
}

export function merge(...parts: Solid[]): Solid {
  const fs = parts.map((p) => p.f);
  return {
    f: (x, y, z) => {
      let d = Infinity;
      for (const f of fs) d = Math.min(d, f(x, y, z));
      return d;
    },
    faces: parts.flatMap((p) => p.faces),
  };
}

export const carve = (s: Solid, ...cuts: Solid[]): Solid => meet(s, ...cuts.map(flip));

/** Remembers the last point: a solid's parts ask for the same field at the same point many times over. */
export function once(f: Field): Field {
  let lx = NaN, ly = NaN, lz = NaN, d = 0;
  return (x, y, z) => {
    if (x !== lx || y !== ly || z !== lz) {
      d = f(x, y, z);
      lx = x;
      ly = y;
      lz = z;
    }
    return d;
  };
}

/** `s` cut by `by` with a fillet of width `k` at each point: where `k` falls to zero the edge is true, and the fillet fades into it. */
export function carveSoft(s: Solid, by: Solid, k: Field, coarse?: number): Solid {
  const cut = flip(by);
  const f: Field = (x, y, z) => smax(s.f(x, y, z), cut.f(x, y, z), k(x, y, z));
  const strip: Field = (x, y, z) => Math.abs(s.f(x, y, z) - cut.f(x, y, z)) - k(x, y, z);
  return { f, faces: [...s.faces, ...cut.faces, { f, only: strip, coarse }] };
}
