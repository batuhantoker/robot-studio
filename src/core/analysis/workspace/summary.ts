/** Workspace statistics: voxel volume, reach envelope, and how much of it is limited and why. */
import type { WorkspaceSamples } from './sample';

export interface WorkspaceSummary {
  samples: number;
  /** Occupied-voxel estimate; sampling under-fills thin regions, so treat it as a lower bound. */
  volume: number;
  voxel: number;
  reachMin: number;
  reachMax: number;
  zMin: number;
  zMax: number;
  /** Fraction of samples with manipulability under 5% of the best sample. */
  nearSingular: number;
  /** Fraction of samples whose static gravity load exceeds some motor's limit. */
  overTorque: number;
  /** Fraction of samples within 5% of a joint limit. */
  nearLimit: number;
}

export function summarize(s: WorkspaceSamples): WorkspaceSummary {
  const n = s.points.length;
  const reachMax = Math.max(...s.reach);
  const voxel = Math.max(reachMax / 24, 1e-4);
  const cells = new Set(s.points.map((p) => p.map((v) => Math.floor(v / voxel)).join(',')));
  const best = Math.max(...s.manipulability, 1e-300);
  const frac = (test: (i: number) => boolean) => s.points.filter((_, i) => test(i)).length / n;
  return {
    samples: n,
    volume: cells.size * voxel ** 3,
    voxel,
    reachMin: Math.min(...s.reach),
    reachMax,
    zMin: Math.min(...s.points.map((p) => p[2])),
    zMax: Math.max(...s.points.map((p) => p[2])),
    nearSingular: frac((i) => s.manipulability[i] < 0.05 * best),
    overTorque: frac((i) => s.torqueRatio[i] > 1),
    nearLimit: frac((i) => s.limitMargin[i] < 0.05),
  };
}
