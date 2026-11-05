/** Surface nets over a sparse grid: blocks far from the surface are never sampled. Edges come out round, so cast them round. */
import type { Vec3 } from '../../../core/math/linear/vec';
import type { Field } from './field';

export interface Surface {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
}

const BLOCK = 4;
/** Reused between calls and cleaned by what was touched: a solid meshes many faces in one box, and filling a fresh grid each time cost more than the meshing. */
let grid = new Float32Array(0);
let cells = new Int32Array(0);
const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * `blend` is the widest fillet in `f`: a smooth union reads up to a quarter of it deeper than the true distance.
 * `near`, when given, is a field whose zero set the mesh is wanted around; blocks far from it are skipped.
 */
export function surfaceNet(f: Field, lo: Vec3, hi: Vec3, h: number, blend = 0, near?: Field): Surface {
  const [nx, ny, nz] = [0, 1, 2].map((a) => Math.max(2, Math.ceil((hi[a] - lo[a]) / h) + 2));
  const [sx, sy] = [nx + 1, ny + 1];
  const o = lo.map((v) => v - h);
  if (grid.length < sx * sy * (nz + 1)) grid = new Float32Array(sx * sy * (nz + 1)).fill(NaN);
  if (cells.length < nx * ny * nz) cells = new Int32Array(nx * ny * nz).fill(-1);
  const values = grid, cell = cells;
  const at = (i: number, j: number, k: number) => i + sx * (j + sy * k);
  const blocks: [number, number, number][] = [];
  const seen = new Set<number>();
  const pending: [number, number, number][] = [];
  const reach = (size: number) => size * h * 0.87 * 1.35 + blend / 4;
  const far = (i0: number, j0: number, k0: number, size: number) =>
    !!near && Math.abs(near(o[0] + (i0 + size / 2) * h, o[1] + (j0 + size / 2) * h, o[2] + (k0 + size / 2) * h)) > reach(size);
  const sample = (i0: number, j0: number, k0: number) => {
    const key = i0 + (nx + BLOCK) * (j0 + (ny + BLOCK) * k0);
    if (i0 < 0 || j0 < 0 || k0 < 0 || i0 >= nx || j0 >= ny || k0 >= nz || seen.has(key)) return;
    seen.add(key);
    if (far(i0, j0, k0, BLOCK)) return;
    pending.push([i0, j0, k0]);
  };
  const visit = (i0: number, j0: number, k0: number, size: number) => {
    if (i0 >= nx || j0 >= ny || k0 >= nz) return;
    const half = size / 2;
    const d = f(o[0] + (i0 + half) * h, o[1] + (j0 + half) * h, o[2] + (k0 + half) * h);
    // A little over the half diagonal: some fields only bound the distance.
    if (Math.abs(d) > reach(size) || far(i0, j0, k0, size)) return;
    if (size > BLOCK) for (let c = 0; c < 8; c++) visit(i0 + (c & 1) * half, j0 + ((c >> 1) & 1) * half, k0 + (c >> 2) * half, half);
    else sample(i0, j0, k0);
  };
  const top = BLOCK * 4;
  for (let k0 = 0; k0 < nz; k0 += top) for (let j0 = 0; j0 < ny; j0 += top) for (let i0 = 0; i0 < nx; i0 += top) visit(i0, j0, k0, top);
  // The bound only seeds the walk: a surface reaching a block's face pulls in the block beyond, so no hole depends on it.
  while (pending.length) {
    const [i0, j0, k0] = pending.pop()!;
    blocks.push([i0, j0, k0]);
    const [i1, j1, k1] = [Math.min(i0 + BLOCK, nx), Math.min(j0 + BLOCK, ny), Math.min(k0 + BLOCK, nz)];
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = at(i, j, k);
      if (Number.isNaN(values[c])) values[c] = f(o[0] + i * h, o[1] + j * h, o[2] + k * h);
    }
    const mixed = (axis: number, plane: number) => {
      const [a0, a1, b0, b1] = axis === 0 ? [j0, j1, k0, k1] : axis === 1 ? [i0, i1, k0, k1] : [i0, i1, j0, j1];
      let neg = false, pos = false;
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
        const v = values[axis === 0 ? at(plane, a, b) : axis === 1 ? at(a, plane, b) : at(a, b, plane)];
        if (v < 0) neg = true;
        else pos = true;
      }
      return neg && pos;
    };
    if (mixed(0, i0)) sample(i0 - BLOCK, j0, k0);
    if (mixed(0, i1)) sample(i0 + BLOCK, j0, k0);
    if (mixed(1, j0)) sample(i0, j0 - BLOCK, k0);
    if (mixed(1, j1)) sample(i0, j0 + BLOCK, k0);
    if (mixed(2, k0)) sample(i0, j0, k0 - BLOCK);
    if (mixed(2, k1)) sample(i0, j0, k0 + BLOCK);
  }

  const cellAt = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const points: number[] = [];
  const v = new Float64Array(8);
  const eachCell = (visitCell: (i: number, j: number, k: number) => void) => {
    for (const [i0, j0, k0] of blocks) for (let k = k0; k < Math.min(k0 + BLOCK, nz); k++) for (let j = j0; j < Math.min(j0 + BLOCK, ny); j++) for (let i = i0; i < Math.min(i0 + BLOCK, nx); i++) visitCell(i, j, k);
  };
  eachCell((i, j, k) => {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      v[c] = values[at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])];
      if (v[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) return;
    let px = 0, py = 0, pz = 0, m = 0;
    for (const [a, b] of EDGES) {
      if (v[a] < 0 === v[b] < 0) continue;
      const t = v[a] / (v[a] - v[b]);
      px += CORNERS[a][0] + t * (CORNERS[b][0] - CORNERS[a][0]);
      py += CORNERS[a][1] + t * (CORNERS[b][1] - CORNERS[a][1]);
      pz += CORNERS[a][2] + t * (CORNERS[b][2] - CORNERS[a][2]);
      m++;
    }
    cell[cellAt(i, j, k)] = points.length / 3;
    points.push(o[0] + (i + px / m) * h, o[1] + (j + py / m) * h, o[2] + (k + pz / m) * h);
  });
  const tris: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c);
    else tris.push(a, b, c, a, c, d);
  };
  eachCell((i, j, k) => {
    const s = values[at(i, j, k)];
    if (Number.isNaN(s)) return;
    const inside = s < 0;
    const crosses = (e: number) => !Number.isNaN(e) && e < 0 !== inside;
    if (j > 0 && k > 0 && crosses(values[at(i + 1, j, k)])) quad(cell[cellAt(i, j - 1, k - 1)], cell[cellAt(i, j, k - 1)], cell[cellAt(i, j, k)], cell[cellAt(i, j - 1, k)], !inside);
    if (i > 0 && k > 0 && crosses(values[at(i, j + 1, k)])) quad(cell[cellAt(i - 1, j, k - 1)], cell[cellAt(i - 1, j, k)], cell[cellAt(i, j, k)], cell[cellAt(i, j, k - 1)], !inside);
    if (i > 0 && j > 0 && crosses(values[at(i, j, k + 1)])) quad(cell[cellAt(i - 1, j - 1, k)], cell[cellAt(i, j - 1, k)], cell[cellAt(i, j, k)], cell[cellAt(i - 1, j, k)], !inside);
  });
  const count = points.length / 3;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const e = h * 0.2;
  for (let p = 0; p < count; p++) {
    const x = points[3 * p], y = points[3 * p + 1], z = points[3 * p + 2];
    // Four samples on a tetrahedron give the gradient, and their mean the distance, with one set of calls.
    const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
    const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d;
    const n = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    const step = Math.max(-h, Math.min(h, (a + b + c + d) / 4 / Math.max(n / (4 * e), 0.2)));
    position[3 * p] = x - (gx / n) * step;
    position[3 * p + 1] = y - (gy / n) * step;
    position[3 * p + 2] = z - (gz / n) * step;
    normal[3 * p] = gx / n;
    normal[3 * p + 1] = gy / n;
    normal[3 * p + 2] = gz / n;
  }
  for (const [i0, j0, k0] of blocks) for (let k = k0; k <= Math.min(k0 + BLOCK, nz); k++) for (let j = j0; j <= Math.min(j0 + BLOCK, ny); j++) for (let i = i0; i <= Math.min(i0 + BLOCK, nx); i++) {
    values[at(i, j, k)] = NaN;
    if (i < nx && j < ny && k < nz) cell[cellAt(i, j, k)] = -1;
  }
  return { position, normal, index: Uint32Array.from(tris) };
}
