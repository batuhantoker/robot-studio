/** The per-robot slice of the studio state, kept aside while another robot is active. */
import type { Parked, StudioState } from '../state/types';

// A Record so the compiler insists every Parked field is listed here.
const FIELDS: Record<keyof Parked, true> = {
  q: true, focus: true, waypoints: true, stopOpts: true, pace: true, duration: true, targets: true, task: true, motion: true, selectedStop: true,
};

/** Where a robot starts; the studio fills in its home pose and default path when it loads. */
export const freshRobot = (): Parked => ({
  q: [], focus: 0, waypoints: [], stopOpts: [], pace: 'even', duration: 6, targets: [], selectedStop: null,
  task: { pick: null, place: null, moving: 'pick' },
  motion: { preset: null, speed: 1, size: 1 },
});

export const park = (s: StudioState): Parked =>
  Object.fromEntries((Object.keys(FIELDS) as (keyof Parked)[]).map((k) => [k, s[k]])) as Parked;

export const isParked = (p: unknown): p is Parked =>
  !!p && typeof p === 'object' && (['q', 'waypoints', 'stopOpts', 'targets'] as const).every((k) => Array.isArray((p as Parked)[k]));
