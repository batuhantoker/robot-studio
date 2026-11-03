/** Joint poses that put the tool's working end on a point with the tool pointing down. */
import { chainFrames } from '../../chain/kinematics/frames';
import type { Chain } from '../../chain/model/types';
import { matVec } from '../../math/linear/mat3';
import type { Transform } from '../../math/linear/transform';
import { type Vec3, add, normalize, scale, sub } from '../../math/linear/vec';
import { rng, uniform } from '../../math/random/rng';
import { approachIk } from '../../solvers/ik/approach';
import type { ToolGeometry } from '../types';

export interface PlanContext {
  chain: Chain;
  tool: ToolGeometry;
  /** Weighs approach error (rad) against position (m) in the IK. */
  length: number;
  /** Largest tilt from vertical accepted for a grasp (rad). */
  maxTilt: number;
  /** Rejects joint poses that touch the robot or the floor; redundant arms have many that do not. */
  probe?: (q: number[]) => unknown;
}

const DOWN: Vec3 = [0, 0, -1];

export const toolPose = (ctx: PlanContext, q: number[]): Transform => chainFrames(ctx.chain, q).tip;

const approachOf = (ctx: PlanContext, q: number[]) => normalize(matVec(toolPose(ctx, q).R, ctx.tool.approach));

export const workingEnd = (ctx: PlanContext, q: number[]): Vec3 =>
  add(toolPose(ctx, q).p, scale(approachOf(ctx, q), ctx.tool.beyond));

function solveFrom(ctx: PlanContext, p: Vec3, from: number[]): number[] | null {
  let r = approachIk(ctx.chain, add(p, [0, 0, ctx.tool.beyond]), DOWN, ctx.tool.approach, from, ctx.length, 1);
  // A tool that cannot point straight down swings its working end aside; aim the tool point to suit.
  if (ctx.tool.beyond > 0 && r.tilt > 1e-3) {
    r = approachIk(ctx.chain, sub(p, scale(approachOf(ctx, r.q), ctx.tool.beyond)), DOWN, ctx.tool.approach, r.q, ctx.length, 1);
  }
  const miss = Math.hypot(...sub(workingEnd(ctx, r.q), p));
  return miss < 1e-3 && r.tilt <= ctx.maxTilt ? r.q : null;
}

/** The warm start first, then random starts: the first pose that reaches, points down, and touches nothing. */
export function solveAt(ctx: PlanContext, p: Vec3, from: number[], attempts = 4): number[] | null {
  const next = rng(7);
  for (let i = 0; i < attempts; i++) {
    const start = i === 0 ? from : ctx.chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
    const q = solveFrom(ctx, p, start);
    if (q && !ctx.probe?.(q)) return q;
  }
  return null;
}
