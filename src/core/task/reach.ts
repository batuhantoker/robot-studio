/** Floor spots where the tool can grasp and lift clear, on a polar grid around the arm's base. */
import type { Vec3 } from '../math/linear/vec';
import { type PlanContext, solveAt } from './plan/poses';
import type { TaskObject } from './types';

export interface ReachCell {
  p: Vec3;
  ok: boolean;
}

export interface ReachGrid {
  base: Vec3;
  radius: number;
  floorZ: number;
  rings: number;
  spokes: number;
}

/** One ring of the grid, each cell warm-started from its neighbour; call ring by ring to stay responsive. */
export function reachRing(ctx: PlanContext, home: number[], g: ReachGrid, o: TaskObject, lift: number, ring: number, probe: (q: number[]) => unknown): ReachCell[] {
  const r = (g.radius * (ring + 0.75)) / g.rings;
  const [graspZ, aboveZ] = [g.floorZ + o.graspZ, g.floorZ + o.graspZ + o.size[2] + lift];
  let warm = home;
  return Array.from({ length: g.spokes }, (_, j) => {
    const a = (2 * Math.PI * j) / g.spokes;
    const p: Vec3 = [g.base[0] + r * Math.cos(a), g.base[1] + r * Math.sin(a), g.floorZ];
    const grasp = solveAt(ctx, [p[0], p[1], graspZ], warm, 2);
    const above = grasp && solveAt(ctx, [p[0], p[1], aboveZ], grasp, 1);
    if (grasp) warm = grasp;
    return { p, ok: !!grasp && !!above && !probe(grasp) && !probe(above) };
  });
}

/** The reachable cell nearest to a point, for snapping a dropped pad back inside the reach. */
export function nearestReachable(cells: ReachCell[], p: Vec3): Vec3 | null {
  let best: ReachCell | null = null;
  for (const c of cells) {
    if (c.ok && (!best || Math.hypot(c.p[0] - p[0], c.p[1] - p[1]) < Math.hypot(best.p[0] - p[0], best.p[1] - p[1]))) best = c;
  }
  return best?.p ?? null;
}
