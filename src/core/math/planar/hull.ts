/** Convex hulls and outward offsets of point sets in the plane. */
export type P2 = [number, number];

const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Andrew's monotone chain: counter-clockwise, collinear and repeated points dropped. */
export function convexHull(points: P2[]): P2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const chain = (order: P2[]) => {
    const out: P2[] = [];
    for (const q of order) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...chain(p), ...chain(p.reverse())];
}

/** Points of a flat [x0, y0, x1, y1, …] list that may lie on its hull: those inside the octagon of extremes cannot. */
export function hullCandidates(flat: ArrayLike<number>): P2[] {
  const n = flat.length / 2;
  const lo = [Infinity, Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity, -Infinity];
  const loAt = [0, 0, 0, 0], hiAt = [0, 0, 0, 0];
  const track = (d: number, v: number, i: number) => {
    if (v < lo[d]) (lo[d] = v), (loAt[d] = i);
    if (v > hi[d]) (hi[d] = v), (hiAt[d] = i);
  };
  for (let i = 0; i < n; i++) {
    const x = flat[2 * i], y = flat[2 * i + 1];
    track(0, x, i);
    track(1, y, i);
    track(2, x + y, i);
    track(3, x - y, i);
  }
  const octagon = convexHull([...loAt, ...hiAt].map((i): P2 => [flat[2 * i], flat[2 * i + 1]]));
  if (octagon.length < 3) return octagon;
  const out: P2[] = [...octagon];
  for (let i = 0; i < n; i++) {
    const x = flat[2 * i], y = flat[2 * i + 1];
    for (let j = 0; j < octagon.length; j++) {
      const a = octagon[j], b = octagon[(j + 1) % octagon.length];
      if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) <= 0) {
        out.push([x, y]);
        break;
      }
    }
  }
  return out;
}

/** Hull of the points grown by a disc, so single points and segments get an area too. */
export function roundedHull(points: P2[], radius: number, segments = 12): P2[] {
  const grown: P2[] = [];
  for (const [x, y] of convexHull(points)) {
    for (let k = 0; k < segments; k++) {
      const a = (2 * Math.PI * k) / segments;
      grown.push([x + radius * Math.cos(a), y + radius * Math.sin(a)]);
    }
  }
  return convexHull(grown);
}

/** Each vertex of a counter-clockwise convex polygon pushed out so every edge moves by `d`. */
export function offsetPolygon(poly: P2[], d: number): P2[] {
  const n = poly.length;
  const normal = (a: P2, b: P2): P2 => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
  };
  return poly.map((v, i) => {
    const n1 = normal(poly[(i - 1 + n) % n], v);
    const n2 = normal(v, poly[(i + 1) % n]);
    const m: P2 = [n1[0] + n2[0], n1[1] + n2[1]];
    const len = Math.hypot(m[0], m[1]) || 1;
    const k = d / Math.max((m[0] * n1[0] + m[1] * n1[1]) / len, 0.2);
    return [v[0] + (m[0] / len) * k, v[1] + (m[1] / len) * k];
  });
}
