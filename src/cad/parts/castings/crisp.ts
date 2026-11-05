/** Meshes a solid face by face: each smooth piece on its own, clipped where another takes over, so edges come out exact. */
import type { Vec3 } from '../../../core/math/linear/vec';
import type { Field, Solid } from './field';
import { type Surface, surfaceNet } from './net';

/** Past an edge a piece stops being the solid's boundary. Kept a hair beyond it, so neighbouring pieces overlap instead of leaving a crack. */
const OVERLAP = 0.00008;

interface Mesh {
  p: number[];
  n: number[];
  t: number[];
}

function clip(s: Surface, keep: Field): Mesh {
  const count = s.position.length / 3;
  const p = Array.from(s.position), n = Array.from(s.normal);
  const side = new Float64Array(count);
  for (let i = 0; i < count; i++) side[i] = keep(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
  const cuts = new Map<number, number>();
  const cross = (a: number, b: number) => {
    const key = a < b ? a * count + b : b * count + a;
    let v = cuts.get(key);
    if (v !== undefined) return v;
    // `a` is kept and `b` is not; the field is only piecewise linear, so bisect rather than interpolate.
    let lo = 0, hi = 1;
    const at = (t: number): Vec3 => [p[3 * a] + (p[3 * b] - p[3 * a]) * t, p[3 * a + 1] + (p[3 * b + 1] - p[3 * a + 1]) * t, p[3 * a + 2] + (p[3 * b + 2] - p[3 * a + 2]) * t];
    for (let i = 0; i < 7; i++) {
      const t = (lo + hi) / 2;
      if (keep(...at(t)) <= 0) lo = t;
      else hi = t;
    }
    const q = at(lo);
    const m: Vec3 = [0, 1, 2].map((c) => n[3 * a + c] * (1 - lo) + n[3 * b + c] * lo) as Vec3;
    const len = Math.hypot(...m) || 1;
    v = p.length / 3;
    p.push(...q);
    n.push(m[0] / len, m[1] / len, m[2] / len);
    cuts.set(key, v);
    return v;
  };
  const t: number[] = [];
  for (let i = 0; i < s.index.length; i += 3) {
    const tri = [s.index[i], s.index[i + 1], s.index[i + 2]];
    const kept: number[] = [];
    tri.forEach((a, c) => {
      const b = tri[(c + 1) % 3];
      const [ka, kb] = [side[a] <= 0, side[b] <= 0];
      if (ka) kept.push(a);
      if (ka && !kb) kept.push(cross(a, b));
      else if (!ka && kb) kept.push(cross(b, a));
    });
    for (let c = 1; c + 1 < kept.length; c++) t.push(kept[0], kept[c], kept[c + 1]);
  }
  return { p, n, t };
}

/**
 * Drops pieces that were never really the boundary. A face's field crossing the solid's surface elsewhere
 * agrees with it along a line, and leaves a hair-thin strip there that the ink overlay would outline.
 */
function activeOnly(m: Mesh, active: (x: number, y: number, z: number) => boolean): Mesh {
  const parent = new Int32Array(m.p.length / 3).map((_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (let i = 0; i < m.t.length; i += 3) {
    parent[find(m.t[i + 1])] = find(m.t[i]);
    parent[find(m.t[i + 2])] = find(m.t[i]);
  }
  // Triangle centres: a piece narrower than a cell may have no vertex of its own on the boundary.
  const alive = new Set<number>();
  for (let i = 0; i < m.t.length; i += 3) {
    const [a, b, c] = [3 * m.t[i], 3 * m.t[i + 1], 3 * m.t[i + 2]];
    if (active((m.p[a] + m.p[b] + m.p[c]) / 3, (m.p[a + 1] + m.p[b + 1] + m.p[c + 1]) / 3, (m.p[a + 2] + m.p[b + 2] + m.p[c + 2]) / 3)) alive.add(find(m.t[i]));
  }
  return { ...m, t: m.t.filter((_, i) => alive.has(find(m.t[i - (i % 3)]))) };
}

/** `inner` picks the hollow's faces, or everything else. */
export function surfaceOf(s: Solid, lo: Vec3, hi: Vec3, h: number, blend = 0, inner = false): Surface {
  const parts: Mesh[] = [];
  for (const face of s.faces) {
    if (!!face.inner !== inner) continue;
    const net = surfaceNet(face.f, lo, hi, h * (face.coarse ?? 1), blend, s.f);
    if (!net.index.length) continue;
    const { only } = face;
    const m = clip(net, (x, y, z) => Math.max(Math.abs(s.f(x, y, z) - face.f(x, y, z)) - OVERLAP, only ? only(x, y, z) : -1));
    const live = activeOnly(m, (x, y, z) => s.f(x, y, z) === face.f(x, y, z));
    if (live.t.length) parts.push(live);
  }
  const used = parts.map((m) => {
    const map = new Map<number, number>();
    for (const v of m.t) if (!map.has(v)) map.set(v, map.size);
    return map;
  });
  const count = used.reduce((c, m) => c + m.size, 0);
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
  const index = new Uint32Array(parts.reduce((c, m) => c + m.t.length, 0));
  let base = 0, at = 0;
  parts.forEach((m, k) => {
    for (const [v, i] of used[k]) for (let c = 0; c < 3; c++) {
      position[3 * (base + i) + c] = m.p[3 * v + c];
      normal[3 * (base + i) + c] = m.n[3 * v + c];
    }
    for (const v of m.t) index[at++] = base + used[k].get(v)!;
    base += used[k].size;
  });
  return { position, normal, index };
}
