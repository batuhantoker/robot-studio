/** Trajectory presets for the loaded robot: listed per focused limb, solved against its own collision model. */
import { enforceLimits } from '../../core/chain/limbs/limits';
import { type TrajectoryPreset, buildTrajectoryPreset, trajectoryPresetsFor } from '../../core/trajectory/presets/build';
import { defaultWaypoints } from '../../core/trajectory/quintic/sample';
import { clearWaypoints } from '../collision/waypoints';
import { jointLimits } from '../robots/focus';
import type { RobotSession } from '../robots/session';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';

export const DEFAULT_DURATION = 6;
const DEFAULT: TrajectoryPreset = { id: 'default', label: 'Default', hint: 'Every joint out and back, evenly paced (the analyze() scenario)' };

const home = (s: RobotSession) => enforceLimits(s.joints, s.home);

/** The studio's starting trajectory: analyze()'s default, fitted clear of contact. */
export const defaultPlan = (s: RobotSession, duration = DEFAULT_DURATION): Pick<StudioState, 'waypoints' | 'stopOpts' | 'pace' | 'duration'> =>
  ({ waypoints: clearWaypoints(s, defaultWaypoints(jointLimits(s)), duration), stopOpts: [], pace: 'even', duration });

export const presetsFor = (s: RobotSession, focus: number): TrajectoryPreset[] => [DEFAULT, ...trajectoryPresetsFor(s, focus, home(s))];

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
