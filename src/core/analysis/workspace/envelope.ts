/**
 * Datasheet-style side envelope: tool positions projected to (radius from the base's vertical
 * axis, height), rasterized, gaps closed morphologically, and the boundary traced.
 */
import type { Vec3 } from '../../math/linear/vec';

export interface SideEnvelope {
  cell: number;
  nr: number;
  nz: number;
  z0: number;
  /** Row-major occupancy, nz rows of nr cells; r grows from the axis. */
  filled: Uint8Array;
}

function morph(src: Uint8Array, nr: number, nz: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let z = 0; z < nz; z++) {
    for (let r = 0; r < nr; r++) {
      let hit = !grow;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dr = -1; dr <= 1; dr++) {
          const rr = Math.abs(r + dr), zz = z + dz;
          const v = rr < nr && zz >= 0 && zz < nz ? src[zz * nr + rr] : 0;
          hit = grow ? hit || v === 1 : hit && v === 1;
        }
      }
      out[z * nr + r] = hit ? 1 : 0;
    }
  }
  return out;
}

export function sideEnvelope(points: Vec3[], axis: Vec3, cells = 64, closing = 2): SideEnvelope {
  const rz = points.map((p) => [Math.hypot(p[0] - axis[0], p[1] - axis[1]), p[2]] as const);
  const rmax = Math.max(...rz.map((v) => v[0]), 1e-3);
  const z0 = Math.min(...rz.map((v) => v[1])), z1 = Math.max(...rz.map((v) => v[1]));
  const cell = Math.max(rmax, z1 - z0) / cells;
  const nr = Math.ceil(rmax / cell) + closing + 1;
  const nz = Math.ceil((z1 - z0) / cell) + 2 * closing + 1;
  const base = z0 - closing * cell;
  let grid: Uint8Array = new Uint8Array(nr * nz);
  for (const [r, z] of rz) grid[Math.floor((z - base) / cell) * nr + Math.floor(r / cell)] = 1;
  for (let i = 0; i < closing; i++) grid = morph(grid, nr, nz, true);
  for (let i = 0; i < closing; i++) grid = morph(grid, nr, nz, false);
  return { cell, nr, nz, z0: base, filled: grid };
}

/** Boundary edges between filled and empty cells, in (r, z) metres, mirrored to both sides. */
export function envelopeOutline(e: SideEnvelope): [number, number, number, number][] {
  const at = (r: number, z: number) => (r >= 0 && r < e.nr && z >= 0 && z < e.nz ? e.filled[z * e.nr + r] : 0);
  const out: [number, number, number, number][] = [];
  for (let z = 0; z < e.nz; z++) {
    for (let r = 0; r < e.nr; r++) {
      if (!at(r, z)) continue;
      const [x0, x1, y0, y1] = [r * e.cell, (r + 1) * e.cell, e.z0 + z * e.cell, e.z0 + (z + 1) * e.cell];
      if (!at(r + 1, z)) out.push([x1, y0, x1, y1]);
      if (r > 0 && !at(r - 1, z)) out.push([x0, y0, x0, y1]);
      if (!at(r, z + 1)) out.push([x0, y1, x1, y1]);
      if (!at(r, z - 1)) out.push([x0, y0, x1, y0]);
    }
  }
  return [...out, ...out.map(([a, b, c, d]) => [-a, b, -c, d] as [number, number, number, number])];
}
