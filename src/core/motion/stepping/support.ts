/** Support polygons: the feet on the ground seen from above, and how far a point stands inside them. */
import { type P2, convexHull } from '../../math/planar/hull';

export const supportPolygon = (points: P2[]): P2[] => convexHull(points);

export function centroid(poly: P2[]): P2 {
  let area = 0, x = 0, y = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], c = a[0] * b[1] - b[0] * a[1];
    area += c;
    x += (a[0] + b[0]) * c;
    y += (a[1] + b[1]) * c;
  });
  if (Math.abs(area) > 1e-12) return [x / (3 * area), y / (3 * area)];
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
}

function toSegment(p: P2, a: P2, b: P2): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]], d = dx * dx + dy * dy;
  const k = d > 0 ? Math.min(Math.max(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d, 0), 1) : 0;
  return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
}

/** Distance from `p` to the polygon's edge: positive inside, negative outside. */
export function margin(poly: P2[], p: P2): number {
  const edges = poly.map((a, i) => [a, poly[(i + 1) % poly.length]] as const);
  const near = Math.min(...edges.map(([a, b]) => toSegment(p, a, b)));
  if (poly.length < 3) return -near;
  const inside = edges.every(([a, b]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0);
  return inside ? near : -near;
}
