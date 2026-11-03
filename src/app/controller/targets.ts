/** Per-limb IK targets. */
import { chainFrames } from '../../core/chain/kinematics/frames';
import type { Vec3 } from '../../core/math/linear/vec';
import { focusLimb, focusQ } from '../robots/focus';
import type { RobotSession } from '../robots/session';
import type { StudioState } from '../state/types';

export function withTarget(targets: (Vec3 | null)[], limb: number, point: Vec3 | null): (Vec3 | null)[] {
  const next = [...targets];
  while (next.length <= limb) next.push(null);
  next[limb] = point;
  return next;
}

/** The focused limb's current tool point, the natural place to drop a new target. */
export const focusTip = (s: RobotSession, st: StudioState): Vec3 =>
  chainFrames(focusLimb(s, st.focus).chain, focusQ(s, st.focus, st.q)).tip.p;
