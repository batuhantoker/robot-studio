/** Where the object sits: upright on the floor under the grasp, or fixed to the tool frame while held. */
import { matVec } from '../../math/linear/mat3';
import { type Transform, compose, invert } from '../../math/linear/transform';
import { type Vec3, cross, normalize } from '../../math/linear/vec';
import type { TaskObject } from '../types';
import { type PlanContext, toolPose, workingEnd } from './poses';

/** Upright under the working end, turned so its width lies across the jaws. */
export function restingPose(ctx: PlanContext, grasp: number[], o: TaskObject, floorZ: number): Transform {
  const w = workingEnd(ctx, grasp);
  const side = matVec(toolPose(ctx, grasp).R, ctx.tool.side);
  const x: Vec3 = Math.hypot(side[0], side[1]) > 1e-6 ? normalize([side[0], side[1], 0]) : [1, 0, 0];
  const y = cross([0, 0, 1], x);
  return { R: [x[0], y[0], 0, x[1], y[1], 0, x[2], y[2], 1], p: [w[0], w[1], floorZ + o.size[2] / 2] };
}

export const heldOffset = (ctx: PlanContext, grasp: number[], pose: Transform): Transform =>
  compose(invert(toolPose(ctx, grasp)), pose);

/** Released at `release`: it lands upright where the tool left it, keeping its heading. */
export function settle(ctx: PlanContext, release: number[], offset: Transform, o: TaskObject, floorZ: number): Transform {
  const held = compose(toolPose(ctx, release), offset);
  const x = held.R;
  const head: Vec3 = Math.hypot(x[0], x[3]) > 1e-6 ? normalize([x[0], x[3], 0]) : [1, 0, 0];
  const y = cross([0, 0, 1], head);
  return { R: [head[0], y[0], 0, head[1], y[1], 0, 0, 0, 1], p: [held.p[0], held.p[1], floorZ + o.size[2] / 2] };
}
