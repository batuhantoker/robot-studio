/** Where the robot meets the floor: one convex footprint per group of touching meshes. */
import { type Solid, vertexArray } from '../../../cad/common/lowest';
import { type P2, convexHull, hullCandidates } from '../../../core/math/planar/hull';

interface Footprint {
  hull: P2[];
  min: P2;
  max: P2;
}

function footprint(points: P2[]): Footprint {
  const hull = convexHull(points);
  const xs = hull.map((p) => p[0]), ys = hull.map((p) => p[1]);
  return { hull, min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

const near = (a: Footprint, b: Footprint, gap: number) =>
  a.min[0] - gap <= b.max[0] && b.min[0] - gap <= a.max[0] && a.min[1] - gap <= b.max[1] && b.min[1] - gap <= a.max[1];

/** Hull candidates of each mesh's vertices within `tol` of the floor, as world XY. Solids sorted lowest bound first. */
function touching(list: Solid[], floor: number, tol: number): P2[][] {
  const out: P2[][] = [];
  const flat: number[] = [];
  for (const { mesh, bound } of list) {
    if (bound > floor + tol) break;
    const { array: a, stride, offset, count } = vertexArray(mesh);
    const e = mesh.matrixWorld.elements;
    flat.length = 0;
    for (let i = 0, k = offset; i < count; i++, k += stride) {
      const x = a[k], y = a[k + 1], z = a[k + 2];
      if (e[2] * x + e[6] * y + e[10] * z + e[14] > floor + tol) continue;
      flat.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13]);
    }
    if (flat.length) out.push(hullCandidates(flat));
  }
  return out;
}

/** Footprint hulls; meshes whose footprints lie within `gap` of each other (one base, one foot) merge. */
export function contactPatches(list: Solid[], floor: number, tol: number, gap: number): P2[][] {
  const prints = touching(list, floor, tol).map(footprint);
  const mergeOne = () => {
    for (let i = 0; i < prints.length; i++) {
      for (let j = i + 1; j < prints.length; j++) {
        if (!near(prints[i], prints[j], gap)) continue;
        prints[i] = footprint([...prints[i].hull, ...prints[j].hull]);
        prints.splice(j, 1);
        return true;
      }
    }
    return false;
  };
  while (mergeOne());
  return prints.map((f) => f.hull);
}
