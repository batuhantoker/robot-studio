/** Collision stand-ins for a casting: spheres inscribed in its field, so a hull can follow what is drawn and never cross an interface. */
import type { Vec3 } from '../../../core/math/linear/vec';
import type { Field } from './field';
import type { Surface } from './net';

export interface Ball {
  at: Vec3;
  r: number;
}

export interface CoverOptions {
  /** Stop once no surface point lies further than this outside the hull. */
  tolerance: number;
  /** A sphere smaller than this is not worth a geom. */
  smallest: number;
  /** Largest sphere to try. */
  largest: number;
  most: number;
  /** Normals of the body's flat interfaces: probing along them makes a sphere's clearance from each exact. */
  faces: Vec3[];
  /** What must stay clear, positive outside: bars' holes and other joints' hardware. Thin enough to slip between probes, so each sphere is held off them by distance. */
  bores?: Field[];
  /** A quarter of the probes, each sphere shrunk to make up for what they miss: for a robot being edited. */
  quick?: boolean;
  /** How far a mesh vertex can lie from the true surface and still count as on it; a coarse mesh strays further. */
  stray?: number;
}

/** Golden-spiral directions, dense enough that a 50 mm sphere can bulge under a millimetre between them: half an interface gap. */
const PROBES: Vec3[] = Array.from({ length: 128 }, (_, i) => {
  const z = 1 - (2 * (i + 0.5)) / 128, r = Math.sqrt(1 - z * z), a = i * 2.399963;
  return [r * Math.cos(a), r * Math.sin(a), z];
});

const QUICK_SHRINK = 0.95;

/**
 * The largest sphere touching the surface at `p` from inside, by bisection along the inward normal.
 * Tests containment by probing the sphere itself: a blend's gradient is below one, so `-f` understates the room there.
 */
function tangentBall(f: Field, p: Vec3, n: Vec3, largest: number, slop: number, probes: Vec3[]): Ball {
  const fits = (r: number) => {
    const x = p[0] - n[0] * r, y = p[1] - n[1] * r, z = p[2] - n[2] * r;
    for (const u of probes) if (f(x + u[0] * r, y + u[1] * r, z + u[2] * r) > slop) return false;
    return true;
  };
  let lo = 0, hi = largest;
  for (let i = 0; i < 9; i++) {
    const r = (lo + hi) / 2;
    if (fits(r)) lo = r;
    else hi = r;
  }
  const at: Vec3 = [p[0] - n[0] * lo, p[1] - n[1] * lo, p[2] - n[2] * lo];
  let spill = 0;
  for (const u of probes) spill = Math.max(spill, f(at[0] + u[0] * lo, at[1] + u[1] * lo, at[2] + u[2] * lo));
  return { at, r: Math.max(0, lo - spill) };
}

/** Farthest first: each sphere goes where the hull is worst so far, which is what bounds its error. */
export function coverSurface(f: Field, s: Surface, o: CoverOptions): Ball[] {
  const n = s.position.length / 3;
  const stride = Math.max(1, Math.floor(n / 3500));
  const m = Math.ceil(n / stride);
  const outside = new Float64Array(m).fill(Infinity);
  // The mesh also holds the casting's inside, which a hull has nothing to do with.
  for (let i = 0; i < m; i++) {
    const v = i * stride * 3;
    if (Math.abs(f(s.position[v], s.position[v + 1], s.position[v + 2])) > (o.stray ?? 0.0012)) outside[i] = 0;
  }
  const balls: Ball[] = [];
  const probes = [...o.faces, ...(o.quick ? PROBES.filter((_, i) => i % 4 === 0) : PROBES)];
  // Ends by itself: every pass adds a sphere or retires a point. A cap on passes would let slivers that hold no sphere use them all up.
  while (balls.length < o.most) {
    let worst = 0;
    for (let i = 1; i < m; i++) if (outside[i] > outside[worst]) worst = i;
    if (outside[worst] <= o.tolerance) break;
    const v = worst * stride * 3;
    const b = tangentBall(f, [s.position[v], s.position[v + 1], s.position[v + 2]], [s.normal[v], s.normal[v + 1], s.normal[v + 2]], o.largest, o.smallest * 0.1, probes);
    if (o.quick) b.r *= QUICK_SHRINK;
    for (const bore of o.bores ?? []) b.r = Math.min(b.r, bore(...b.at));
    if (b.r < o.smallest) {
      outside[worst] = 0;
      continue;
    }
    balls.push(b);
    for (let i = 0; i < m; i++) {
      const w = i * stride * 3;
      const dx = s.position[w] - b.at[0], dy = s.position[w + 1] - b.at[1], dz = s.position[w + 2] - b.at[2];
      outside[i] = Math.min(outside[i], Math.sqrt(dx * dx + dy * dy + dz * dz) - b.r);
    }
  }
  return balls;
}
