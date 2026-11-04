/** A loaded robot's body plan (parts, sides, labels, facing), read once per session at its home pose. */
import { type Body, bodyOf, workStance } from '../../core/motion/body';
import type { Stance } from '../../scene/stage/scenery/kit';
import type { RobotSession } from './session';

const cache = new WeakMap<RobotSession, Body>();

export function bodyFor(s: RobotSession): Body {
  let b = cache.get(s);
  if (!b) cache.set(s, (b = bodyOf(s, s.home, s.category)));
  return b;
}

/** Humanoids stand on the floor at their work instead of being bolted on top of it. */
export function stanceOf(s: RobotSession): Stance | undefined {
  if (s.category !== 'humanoid' || s.base === 'fixed') return undefined;
  return { standing: true, ...workStance(bodyFor(s)) };
}

/** What the UI calls a limb: "Right arm", "Front left wheel", or the chain's own name on a single arm. */
export const limbLabel = (s: RobotSession, i: number): string =>
  (s.prosthesis ? s.limbs[i].name.replace(/^./, (c) => c.toUpperCase()) : null) ?? (s.limbs.length > 1 ? bodyFor(s).labels[i] : null) ?? s.limbs[i].name;
