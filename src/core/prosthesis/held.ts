/** Things a hand holds, as signed distance fields in the object's own frame: fingers are measured against these. */

export type HeldShape =
  /** A can or bottle, its axis along z. */
  | { kind: 'cylinder'; radius: number; length: number }
  | { kind: 'ball'; radius: number }
  /** A flat key: a round bow at −y and a blade along +y, its faces normal to z. */
  | { kind: 'key'; bow: number; blade: [number, number]; thick: number }
  /** A carrying handle: a bar along z. */
  | { kind: 'bar'; radius: number; length: number }
  /** A small machined pin along z. */
  | { kind: 'pin'; radius: number; length: number };

const roundedBox = (x: number, y: number, z: number, hx: number, hy: number, hz: number, r: number): number => {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return out + Math.min(Math.max(qx, qy, qz), 0) - r;
};

const rod = (x: number, y: number, z: number, radius: number, length: number): number => {
  const dr = Math.hypot(x, y) - radius, dz = Math.abs(z) - length / 2;
  return Math.min(Math.max(dr, dz), 0) + Math.hypot(Math.max(dr, 0), Math.max(dz, 0));
};

/** Signed distance from a point to the surface, negative inside; metres. */
export function heldDistance(s: HeldShape, x: number, y: number, z: number): number {
  switch (s.kind) {
    case 'ball': return Math.hypot(x, y, z) - s.radius;
    case 'cylinder': case 'bar': case 'pin': return rod(x, y, z, s.radius, s.length);
    case 'key': {
      const bow = rod(x, y + s.blade[0] / 2 + s.bow * 0.8, z, s.bow, s.thick);
      return Math.min(bow, roundedBox(x, y, z, s.blade[1] / 2, s.blade[0] / 2, s.thick / 2, s.thick * 0.4));
    }
  }
}

/** The shape scaled about its centre; a key keeps its size. */
export function scaledShape(s: HeldShape, k: number): HeldShape {
  switch (s.kind) {
    case 'ball': return { ...s, radius: s.radius * k };
    case 'cylinder': case 'bar': case 'pin': return { ...s, radius: s.radius * k };
    case 'key': return s;
  }
}
