/** Whole-body IK on target moves, then a replay of the solver's iterates so convergence shows. */
import type { Vec3 } from '../../../core/math/linear/vec';
import { solveWholeBody } from '../../../core/solvers/ik/multi';
import type { IkResult } from '../../../core/solvers/ik/types';
import { guardPath } from '../../collision/jog';
import type { RobotSession } from '../../robots/session';

export class IkMode {
  result: IkResult | null = null;
  /** What the replay ran into before reaching the solution, if anything. */
  blocked: string | null = null;
  private frames: number[][] = [];
  private cursor = 0;

  solve(s: RobotSession, targets: (Vec3 | null)[], q0: number[]): void {
    const active = targets.flatMap((point, limb) => (point && s.limbs[limb] ? [{ limb, point }] : []));
    this.blocked = null;
    if (!active.length) {
      this.result = null;
      return;
    }
    this.result = solveWholeBody(s.limbs, s.joints, active, q0, { restarts: 4, seed: 1 });
    const replay = guardPath(s, q0, [...this.result.steps.filter((x) => x.attempt === 0).map((x) => x.q).slice(0, 40), this.result.q]);
    this.frames = replay.path;
    this.blocked = replay.contact;
    this.cursor = 0;
  }

  /** Next replay pose; `done` is set exactly once, on the final pose. */
  next(): { q: number[]; done: boolean } | null {
    if (this.cursor >= this.frames.length) return null;
    const q = this.frames[this.cursor++];
    return { q, done: this.cursor === this.frames.length };
  }
}
