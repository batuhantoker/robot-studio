/** Where the robot meets the floor: one convex footprint per group of touching meshes. */
import { type Solid, vertexArray } from '../../../cad/common/lowest';
import { type P2, convexHull, hullCandidates } from '../../../core/math/planar/hull';

/** A footprint on the floor; `sunk` when part of it has gone through. */
export interface ContactPatch {
  hull: P2[];
  sunk: boolean;
}

interface Footprint extends ContactPatch {
  min: P2;
  max: P2;
}

function footprint(points: P2[], sunk: boolean): Footprint {
  const hull = convexHull(points);
  const xs = hull.map((p) => p[0]), ys = hull.map((p) => p[1]);
  return { hull, sunk, min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

const near = (a: Footprint, b: Footprint, gap: number) =>
  a.min[0] - gap <= b.max[0] && b.min[0] - gap <= a.max[0] && a.min[1] - gap <= b.max[1] && b.min[1] - gap <= a.max[1];

/**
 * Hull candidates of each mesh's vertices within `tol` of the floor, as world XY, and whether any lies
 * `depth` below it. Vertices decide that: the solids' bounds are loose. Solids sorted lowest bound first.
 */
function touching(list: Solid[], floor: number, tol: number, depth: number): { points: P2[]; sunk: boolean }[] {
  const out: { points: P2[]; sunk: boolean }[] = [];
  const flat: number[] = [];
  for (const { mesh, bound } of list) {
    if (bound > floor + tol) break;
    const { array: a, stride, offset, count } = vertexArray(mesh);
    const e = mesh.matrixWorld.elements;
    flat.length = 0;
    let sunk = false;
    for (let i = 0, k = offset; i < count; i++, k += stride) {
      const x = a[k], y = a[k + 1], z = a[k + 2];
      const height = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (height > floor + tol) continue;
      sunk ||= height < floor - depth;
      flat.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13]);
    }
    if (flat.length) out.push({ points: hullCandidates(flat), sunk });
  }
  return out;
}

/** Footprint hulls; meshes whose footprints lie within `gap` of each other (one base, one foot) merge, but a sunk part never takes a resting one with it. */
export function footprints(list: Solid[], floor: number, tol: number, gap: number, depth: number): ContactPatch[] {
  const prints = touching(list, floor, tol, depth).map((t) => footprint(t.points, t.sunk));
  const mergeOne = () => {
    for (let i = 0; i < prints.length; i++) {
      for (let j = i + 1; j < prints.length; j++) {
        if (prints[i].sunk !== prints[j].sunk || !near(prints[i], prints[j], gap)) continue;
        prints[i] = footprint([...prints[i].hull, ...prints[j].hull], prints[i].sunk);
        prints.splice(j, 1);
        return true;
      }
    }
    return false;
  };
  while (mergeOne());
  return prints.map(({ hull, sunk }) => ({ hull, sunk }));
}

/** Just the hulls, nothing counted as sunk. */
export const contactPatches = (list: Solid[], floor: number, tol: number, gap: number): P2[][] =>
  footprints(list, floor, tol, gap, Infinity).map((f) => f.hull);
