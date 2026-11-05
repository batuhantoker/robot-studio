/** Runs the layout search a few milliseconds per tick so the page stays responsive; the returned function cancels it. */
import type { Vec3 } from '../../../core/math/linear/vec';
import { type Arranged, type TaskSetup, arrangeSteps } from './setup';

const SLICE_MS = 8;
/** Long enough for the panel to paint its status before the first slice takes the page. */
const PAINT_MS = 20;

/** `alive` false ends it quietly: a replaced session's model is freed soon after, and the search must not touch it. */
export function layoutJob(t: TaskSetup, clear: (p: Vec3) => boolean, alive: () => boolean, done: (found: Arranged) => void): () => void {
  let cancelled = false, crowded = false, last = false;
  let steps = arrangeSteps(t, (p) => {
    const ok = clear(p);
    crowded ||= !ok;
    return ok;
  });
  const tick = () => {
    if (cancelled || !alive()) return;
    const end = performance.now() + SLICE_MS;
    let step = steps.next();
    while (!step.done && performance.now() < end) step = steps.next();
    if (!step.done) {
      setTimeout(tick, 0);
      return;
    }
    // Clear of the setting if it can be; a crowded bench shouldn't leave the arm with no spots at all.
    if (!step.value.spots && crowded && !last) {
      last = true;
      steps = arrangeSteps(t);
      setTimeout(tick, 0);
      return;
    }
    done(step.value);
  };
  setTimeout(tick, PAINT_MS);
  return () => (cancelled = true);
}
