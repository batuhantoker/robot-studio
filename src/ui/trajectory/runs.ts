/** Stops as the editors list them: rest stops one by one, each run of vias folded into one item. */
import type { StudioState } from '../../app/state/types';
import { isVia } from '../../core/trajectory/plan';

export type StopItem = { kind: 'stop'; i: number; via: boolean } | { kind: 'vias'; from: number; to: number };

/** The selected stop is always its own item, so a via being edited shows up. */
export function stopItems(s: StudioState): StopItem[] {
  const plan = { waypoints: s.waypoints, duration: s.duration, opts: s.stopOpts };
  const out: StopItem[] = [];
  s.waypoints.forEach((_, i) => {
    const via = isVia(plan, i);
    if (!via || i === s.selectedStop) return void out.push({ kind: 'stop', i, via });
    const last = out[out.length - 1];
    if (last?.kind === 'vias' && last.to === i - 1) last.to = i;
    else out.push({ kind: 'vias', from: i, to: i });
  });
  return out;
}
