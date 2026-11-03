/** Trajectory presets for the loaded robot: listed per focused limb, solved against its own collision model. */
import { enforceLimits } from '../../core/chain/limbs/limits';
import { type TrajectoryPreset, buildTrajectoryPreset, trajectoryPresetsFor } from '../../core/trajectory/presets/build';
import type { RobotSession } from '../robots/session';
import type { Store } from '../state/store';
import type { StudioState } from '../state/types';

const home = (s: RobotSession) => enforceLimits(s.joints, s.home);

export const presetsFor = (s: RobotSession, focus: number): TrajectoryPreset[] => trajectoryPresetsFor(s, focus, home(s));

/** Load preset `id` and play it; returns a note for the user (or null when it fit as designed). */
export function loadPreset(store: Store<StudioState>, s: RobotSession, id: string): string | null {
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
