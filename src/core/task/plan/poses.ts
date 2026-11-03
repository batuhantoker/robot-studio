/** Joint poses that put the tool's working end on a point with the tool pointing down. */
import { chainFrames } from '../../chain/kinematics/frames';
import type { Chain } from '../../chain/model/types';
import { matVec } from '../../math/linear/mat3';
import type { Transform } from '../../math/linear/transform';
import { type Vec3, add, normalize, scale, sub } from '../../math/linear/vec';
import { approachIk } from '../../solvers/ik/approach';
import type { ToolGeometry } from '../types';

export interface PlanContext {
  chain: Chain;
  tool: ToolGeometry;
  /** Weighs approach error (rad) against position (m) in the IK. */
  length: number;
  /** Largest tilt from vertical accepted for a grasp (rad). */
  maxTilt: number;
}

const DOWN: Vec3 = [0, 0, -1];

export const toolPose = (ctx: PlanContext, q: number[]): Transform => chainFrames(ctx.chain, q).tip;

const approachOf = (ctx: PlanContext, q: number[]) => normalize(matVec(toolPose(ctx, q).R, ctx.tool.approach));

export const workingEnd = (ctx: PlanContext, q: number[]): Vec3 =>
  add(toolPose(ctx, q).p, scale(approachOf(ctx, q), ctx.tool.beyond));

/** Null when the point is out of reach or the tool cannot point close enough to down there. */
export function solveAt(ctx: PlanContext, p: Vec3, from: number[], attempts = 4): number[] | null {
  let r = approachIk(ctx.chain, add(p, [0, 0, ctx.tool.beyond]), DOWN, ctx.tool.approach, from, ctx.length, attempts);
  // A tool that cannot point straight down swings its working end aside; aim the tool point to suit.
  if (ctx.tool.beyond > 0 && r.tilt > 1e-3) {
    r = approachIk(ctx.chain, sub(p, scale(approachOf(ctx, r.q), ctx.tool.beyond)), DOWN, ctx.tool.approach, r.q, ctx.length, 1);
  }
  const miss = Math.hypot(...sub(workingEnd(ctx, r.q), p));
  return miss < 1e-3 && r.tilt <= ctx.maxTilt ? r.q : null;
}
