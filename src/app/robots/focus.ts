/** The limb the explanations follow, and its slice of the whole-robot joint vector. */
import { type Limb, limbQ } from '../../core/chain/limbs/types';
import type { RobotSession } from './session';

export const focusLimb = (s: RobotSession, focus: number): Limb => s.limbs[Math.min(Math.max(focus, 0), s.limbs.length - 1)];
export const focusQ = (s: RobotSession, focus: number, q: ArrayLike<number>) => limbQ(focusLimb(s, focus), q);
export const jointLimits = (s: RobotSession) => s.joints.map((j) => j.limits);
