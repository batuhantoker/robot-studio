/**
 * The reachable volume as a closed surface: tool positions swept about the first joint, voxelized,
 * gaps closed morphologically, and meshed with surface nets.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import type { Chain, ChainFrames } from '../../chain/model/types';
import { matVec, rodrigues } from '../../math/linear/mat3';
import { type Vec3, add, scale, sub } from '../../math/linear/vec';
import { rng, uniform } from '../../math/random/rng';

export interface Occupancy {
  /** Centre of cell (0, 0, 0). */
  origin: Vec3;
  cell: number;
  dims: [number, number, number];
  /** x-fastest occupancy. */
  filled: Uint8Array;
}

export interface SurfaceMesh {
  positions: Float32Array;
  /** Counter-clockwise seen from outside. */
  indices: Uint32Array;
}

/** Tool position of pose `f` (taken at `q`) with the first joint moved to `to`: exact, as everything after it moves rigidly. */
export function moveFirstJoint(chain: Chain, f: ChainFrames, q: number[], to: number): Vec3 {
  const o = f.origins[0], a = f.axes[0], d = to - q[0];
  return chain.joints[0].type === 'hinge' ? add(o, matVec(rodrigues(a, d), sub(f.tip.p, o))) : add(f.tip.p, scale(a, d));
}

/** Tool positions with the first joint swept across its range, so few poses still cover it densely. */
export function sweptCloud(chain: Chain, count: number, steps = 32, seed = 0): Vec3[] {
  const next = rng(seed);
  const j0 = chain.joints[0];
  const [lo, hi] = j0.limits;
  const n = j0.type === 'hinge' ? Math.max(2, Math.ceil(((hi - lo) / (2 * Math.PI)) * steps)) : Math.max(2, steps >> 2);
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const q = chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
    const f = chainFrames(chain, q);
    for (let s = 0; s < n; s++) out.push(moveFirstJoint(chain, f, q, lo + ((s + next()) / n) * (hi - lo)));
  }
  return out;
}

/** Cube-element dilation (grow) or erosion of radius 1, done as three separable 1-D passes. */
function morph(src: Uint8Array, dims: [number, number, number], grow: boolean): Uint8Array {
  const [nx, ny] = dims;
  const strides = [1, nx, nx * ny];
  let cur = src;
  for (let axis = 0; axis < 3; axis++) {
    const out = new Uint8Array(cur.length);
    const st = strides[axis], n = dims[axis];
    for (let i = 0; i < cur.length; i++) {
      const c = Math.floor(i / st) % n;
      const a = c > 0 ? cur[i - st] : 0, b = c < n - 1 ? cur[i + st] : 0;
      out[i] = grow ? cur[i] | a | b : cur[i] & a & b;
    }
    cur = out;
  }
  return cur;
}

export function occupancy(points: Vec3[], cells = 48, closing = 2): Occupancy {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  }
  const cell = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-3) / cells;
  // Padding keeps the dilation off the border, so erosion sees true empties there.
  const pad = closing + 1;
  const dims = [0, 1, 2].map((k) => Math.floor((hi[k] - lo[k]) / cell) + 1 + 2 * pad) as [number, number, number];
  const origin = [0, 1, 2].map((k) => lo[k] - (pad - 0.5) * cell) as Vec3;
  let filled: Uint8Array = new Uint8Array(dims[0] * dims[1] * dims[2]);
  for (const p of points) {
    const [i, j, k] = [0, 1, 2].map((a) => Math.floor((p[a] - lo[a]) / cell) + pad);
    filled[i + dims[0] * (j + dims[1] * k)] = 1;
  }
  for (let i = 0; i < closing; i++) filled = morph(filled, dims, true);
  for (let i = 0; i < closing; i++) filled = morph(filled, dims, false);
  return { origin, cell, dims, filled };
}

/** Taubin λ|μ smoothing: rounds off the voxel stairs without shrinking the shell. */
function smooth(pos: number[], tris: number[], passes: number): void {
  const nv = pos.length / 3;
  const nbr: number[][] = Array.from({ length: nv }, () => []);
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) nbr[tris[t + e]].push(tris[t + ((e + 1) % 3)]);
  }
  const step = (w: number) => {
    const prev = pos.slice();
    for (let v = 0; v < nv; v++) {
      const ns = nbr[v];
      if (!ns.length) continue;
      for (let k = 0; k < 3; k++) {
        let m = 0;
        for (const u of ns) m += prev[3 * u + k];
        pos[3 * v + k] += w * (m / ns.length - prev[3 * v + k]);
      }
    }
  };
  for (let i = 0; i < passes; i++) {
    step(0.5);
    step(-0.53);
  }
}

/** Move each vertex `d` along its inward normal. */
function inset(pos: number[], tris: number[], d: number): void {
  const nrm = new Float64Array(pos.length);
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]].map((v) => 3 * v);
    const u = [0, 1, 2].map((k) => pos[b + k] - pos[a + k]), w = [0, 1, 2].map((k) => pos[c + k] - pos[a + k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nrm[v + k] += n[k];
  }
  for (let v = 0; v < pos.length; v += 3) {
    const l = Math.hypot(nrm[v], nrm[v + 1], nrm[v + 2]);
    if (l > 0) for (let k = 0; k < 3; k++) pos[v + k] -= (d * nrm[v + k]) / l;
  }
}

/** Surface nets over the occupancy: one vertex per boundary cube, one quad per boundary edge. */
export function surfaceMesh(o: Occupancy, smoothing = 6): SurfaceMesh {
  const [nx, ny, nz] = o.dims;
  const at = (i: number, j: number, k: number) => o.filled[i + nx * (j + ny * k)];
  const cx = nx - 1, cy = ny - 1;
  const vert = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos: number[] = [];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) mask |= at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1)) << c;
        if (mask === 0 || mask === 255) continue;
        // Average the midpoints of the cube's crossing edges.
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let c = 0; c < 8; c++) {
          for (const bit of [1, 2, 4]) {
            if (c & bit || ((mask >> c) & 1) === ((mask >> (c | bit)) & 1)) continue;
            sx += (c & 1) + (bit === 1 ? 0.5 : 0);
            sy += ((c >> 1) & 1) + (bit === 2 ? 0.5 : 0);
            sz += ((c >> 2) & 1) + (bit === 4 ? 0.5 : 0);
            n++;
          }
        }
        vert[i + cx * (j + cy * k)] = pos.length / 3;
        pos.push(i + sx / n, j + sy / n, k + sz / n);
      }
    }
  }
  const tris: number[] = [];
  const cube = (i: number, j: number, k: number) => vert[i + cx * (j + cy * k)];
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const here = at(i, j, k);
        // Edges toward +x, +y, +z; the four cubes around each, ordered counter-clockwise about it.
        const quads: [number, [number, number, number, number]][] = [
          [at(i + 1, j, k), [cube(i, j - 1, k - 1), cube(i, j, k - 1), cube(i, j, k), cube(i, j - 1, k)]],
          [at(i, j + 1, k), [cube(i - 1, j, k - 1), cube(i - 1, j, k), cube(i, j, k), cube(i, j, k - 1)]],
          [at(i, j, k + 1), [cube(i - 1, j - 1, k), cube(i, j - 1, k), cube(i, j, k), cube(i - 1, j, k)]],
        ];
        for (const [there, [a, b, c, d]] of quads) {
          if (here === there) continue;
          if (here) tris.push(a, b, c, a, c, d);
          else tris.push(a, c, b, a, d, c);
        }
      }
    }
  }
  smooth(pos, tris, smoothing);
  // Any point marks its whole cell, so the voxel boundary sits about half a cell outside the true one.
  inset(pos, tris, 0.5);
  const positions = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    for (let a = 0; a < 3; a++) positions[v + a] = o.origin[a] + pos[v + a] * o.cell;
  }
  return { positions, indices: Uint32Array.from(tris) };
}
