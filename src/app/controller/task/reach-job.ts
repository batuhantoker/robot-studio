/** Builds the reach map at one work height a ring per tick so the page stays responsive; the returned function cancels it. */
import { type ReachCell, reachRing } from '../../../core/task/reach';
import type { TaskSetup } from './setup';

const RINGS = 8, SPOKES = 28;

export function reachJob(t: TaskSetup, z: number, onRing: (cells: ReachCell[]) => void): () => void {
  let cancelled = false;
  const cells: ReachCell[] = [];
  const grid = { base: t.base, radius: t.radius, floorZ: z, rings: RINGS, spokes: SPOKES };
  const step = (ring: number) => {
    if (cancelled) return;
    cells.push(...reachRing(t.ctx, t.seed, grid, t.object, t.lift, ring, t.probe));
    onRing([...cells]);
    if (ring + 1 < RINGS) setTimeout(() => step(ring + 1), 0);
  };
  setTimeout(() => step(0), 0);
  return () => (cancelled = true);
}
