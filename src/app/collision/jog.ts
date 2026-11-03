/** Pose changes that stop where the robot would touch itself or the floor. */
import { enforceLimits } from '../../core/chain/limbs/limits';
import { contactText } from '../../core/collision/hull';
import { guardMove, probeSteps } from '../../core/collision/move';
import { freeSample } from '../../core/collision/sample';
import type { RobotSession } from '../robots/session';

export interface Jog {
  q: number[];
  /** What the move ran into, for the UI; null when it got there. */
  contact: string | null;
}

export function jog(s: RobotSession, from: number[], to: number[]): Jog {
  const c = s.collision;
  if (!c) return { q: to, contact: null };
  const g = guardMove((q) => c.hit(q), enforceLimits(s.joints, from), to, probeSteps(s.joints.map((j) => j.type)));
  return { q: g.q, contact: g.contact && contactText(g.contact) };
}

/** A random pose clear of contact; if none turns up, as far as the robot gets towards the last draw. */
export function randomFree(s: RobotSession, from: number[], sample: () => number[]): Jog {
  const c = s.collision;
  const q = c ? freeSample((x) => c.hit(x), sample) : sample();
  return q ? { q, contact: null } : jog(s, from, sample());
}

/** Cut a replayed path (IK iterates) at its first contact. */
export function guardPath(s: RobotSession, from: number[], path: number[][]): { path: number[][]; contact: string | null } {
  const out: number[][] = [];
  let at = from;
  for (const q of path) {
    const step = jog(s, at, q);
    out.push(step.q);
    if (step.contact) return { path: out, contact: step.contact };
    at = step.q;
  }
  return { path: out, contact: null };
}
