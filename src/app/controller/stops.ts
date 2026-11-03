/** Trajectory stop editing: selecting a stop parks the playhead on it, and edits keep it there. */
import { type StopOpts, compile, isVia } from '../../core/trajectory/plan';
import { insertAt, midpoint, remap, reorder } from '../../core/trajectory/stops';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';
import { planOf } from './modes/trajectory';

type S = Store<StudioState>;

/** Options aligned one-to-one with the stops (the list may lag behind waypoints set elsewhere). */
const optsOf = (s: StudioState): StopOpts[] => s.waypoints.map((_, i) => s.stopOpts[i] ?? {});

export const selectStop = (store: S, i: number | null): void => store.set({ selectedStop: i, playing: false, mode: 'trajectory' });

/**
 * A new stop, selected so it can be moved straight away: after the selected stop (halfway to the
 * next one), else at the playhead's pose in trajectory mode, else the current pose before the last.
 */
export function addStop(store: S, shown: number[] | null): void {
  const s = store.state, w = s.waypoints, n = w.length;
  if (n < 2) return;
  let at: number, q: number[];
  if (s.mode === 'trajectory' && s.selectedStop !== null) {
    at = s.selectedStop + 1;
    q = at < n ? midpoint(w[s.selectedStop], w[at]) : [...w[s.selectedStop]];
  } else if (s.mode === 'trajectory' && shown) {
    at = compile(planOf(s)).segmentAt(s.time) + 1;
    q = [...shown];
  } else {
    at = n - 1;
    q = [...s.q];
  }
  // Inside a run of vias the new point flows with them; elsewhere it's a stop.
  const via = !!(optsOf(s)[at - 1]?.via && optsOf(s)[at]?.via);
  store.set({ waypoints: insertAt(w, at, q), stopOpts: insertAt(optsOf(s), at, via ? { via } : {}), selectedStop: at, playing: false, mode: 'trajectory' });
}

export function removeStop(store: S, i: number): void {
  const s = store.state, { waypoints: w, selectedStop: sel } = s;
  if (w.length <= 2) return;
  store.set({
    waypoints: w.filter((_, j) => j !== i),
    stopOpts: optsOf(s).filter((_, j) => j !== i),
    selectedStop: sel === null || sel === i ? null : sel > i ? sel - 1 : sel,
  });
}

export function reorderStop(store: S, from: number, to: number): void {
  const s = store.state, { waypoints: w, selectedStop: sel } = s;
  if (from === to) return;
  store.set({ waypoints: reorder(w, from, to), stopOpts: reorder(optsOf(s), from, to), selectedStop: sel === null ? null : remap(sel, from, to) });
}

export function setStopJoint(store: S, i: number, k: number, value: number): void {
  const w = store.state.waypoints;
  store.set({ waypoints: w.map((q, j) => (j === i ? q.map((v, m) => (m === k ? value : v)) : q)) });
}

/** Change a stop's via/hold; the total grows or shrinks by the hold, so the moves keep their pace. */
export function setStopOpts(store: S, i: number, patch: StopOpts): void {
  const s = store.state;
  // A via never rests, so turning one on drops its hold.
  const stopOpts = optsOf(s).map((o, j) => (j === i ? { ...o, ...patch, ...(patch.via ? { hold: 0 } : {}) } : o));
  const held = (opts: StopOpts[]) => {
    const plan = { waypoints: s.waypoints, duration: s.duration, opts };
    return opts.reduce((sum, o, j) => sum + (isVia(plan, j) ? 0 : Math.max(o.hold ?? 0, 0)), 0);
  };
  store.set({ stopOpts, duration: Math.max(s.duration + held(stopOpts) - held(optsOf(s)), 0.5) });
}
