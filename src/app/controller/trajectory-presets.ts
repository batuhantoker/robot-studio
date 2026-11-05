/** Trajectory presets for the loaded robot: listed per focused limb, solved against its own collision model. */
import { enforceLimits } from '../../core/chain/limbs/limits';
import { type TrajectoryPreset, buildTrajectoryPreset, trajectoryPresetsFor } from '../../core/trajectory/presets/build';
import { defaultWaypoints } from '../../core/trajectory/quintic/sample';
import { clearTogether, clearWaypoints } from '../collision/waypoints';
import { standingStops } from '../../core/motion/stand-stops';
import { bodyFor } from '../robots/body';
import { jointLimits } from '../robots/focus';
import type { RobotSession } from '../robots/session';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';

export const DEFAULT_DURATION = 6;
const DEFAULT: TrajectoryPreset = { id: 'default', label: 'Default', hint: 'Every joint out and back, evenly paced (the analyze() scenario)' };
const STANDING: TrajectoryPreset = { ...DEFAULT, hint: 'Knees bend and the hands come up, feet planted' };

const home = (s: RobotSession) => enforceLimits(s.joints, s.home);

/** A robot on its legs must not kick them: the body stays pinned while they swing, and the feet leave the floor. */
const stops = (s: RobotSession) => (s.category === 'humanoid' || s.category === 'legged' ? standingStops(s, home(s), bodyFor(s)) : null);

/** The studio's starting trajectory: analyze()'s default around the robot's home, fitted clear of contact. */
export function defaultPlan(s: RobotSession, duration = DEFAULT_DURATION): Pick<StudioState, 'waypoints' | 'stopOpts' | 'pace' | 'duration'> {
  const standing = stops(s);
  const waypoints = standing ? clearTogether(s, standing, duration) : clearWaypoints(s, defaultWaypoints(jointLimits(s), home(s)), duration);
  return { waypoints, stopOpts: [], pace: 'even', duration };
}

/** Paths that mean holding a part; every other path suits any tool. */
const HOLDING = new Set(['pick', 'pallet']);

export const presetsFor = (s: RobotSession, focus: number): TrajectoryPreset[] =>
  [s.category === 'humanoid' || s.category === 'legged' ? STANDING : DEFAULT, ...trajectoryPresetsFor(s, focus, home(s)).filter((p) => s.grips || !HOLDING.has(p.id))];

/** Load preset `id` and play it; returns a note for the user (or null when it fit as designed). */
export function loadPreset(store: Store<StudioState>, s: RobotSession, id: string): string | null {
  if (id === DEFAULT.id) {
    store.set({ ...defaultPlan(s), time: 0, selectedStop: null, contact: null, mode: 'trajectory', playing: true });
    return null;
  }
  const focus = Math.min(Math.max(store.state.focus, 0), s.limbs.length - 1);
  const label = presetsFor(s, focus).find((p) => p.id === id)?.label ?? id;
  const c = s.collision;
  const built = buildTrajectoryPreset(id, s, focus, home(s), c ? (q) => !!c.hit(enforceLimits(s.joints, q)) : undefined);
  if (!built) return `${label} doesn’t fit this limb’s reach.`;
  const { waypoints, opts, pace, duration } = built.plan;
  store.set({ waypoints, stopOpts: opts, pace, duration, time: 0, selectedStop: null, contact: null, mode: 'trajectory', playing: true });
  if (built.touching) return `${label} still touches somewhere; playback stops there.`;
  return built.size < 1 ? `${label}, fitted at ${Math.round(built.size * 100)}% size.` : null;
}
