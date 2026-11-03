/**
 * A body-origin tool point on the last joint's axis gives a dead Jacobian column (a pendulum
 * pivot, an ankle). Use the centre of mass of that body's subtree instead: the bob, the foot.
 */
import type { ChainJoint } from '../../../core/chain/model/types';
import { type Transform, applyTransform, translation } from '../../../core/math/linear/transform';
import { type Vec3, cross, norm, scale } from '../../../core/math/linear/vec';
import type { BodyInfo } from '../bodies';

export function onLastAxis(tip: Transform, last: ChainJoint | undefined): boolean {
  if (!last) return false;
  // The last joint's moving frame has its anchor at the origin for hinges.
  const offAxis = last.type === 'hinge' ? norm(cross(last.axis, tip.p)) : Infinity;
  return offAxis < 1e-6;
}

export function subtreeComTip(bodies: BodyInfo[], tipBody: number, attach: { joint: number; T: Transform }[]): Transform | null {
  const inSubtree = (b: number) => {
    for (let x = b; x > 0; x = bodies[x].parent) if (x === tipBody) return true;
    return false;
  };
  let mass = 0;
  let sum: Vec3 = [0, 0, 0];
  for (const b of bodies) {
    if (b.id === 0 || !(b.mass > 0) || !inSubtree(b.id)) continue;
    const c = applyTransform(attach[b.id].T, b.ipos);
    sum = [sum[0] + b.mass * c[0], sum[1] + b.mass * c[1], sum[2] + b.mass * c[2]];
    mass += b.mass;
  }
  return mass > 0 ? translation(scale(sum, 1 / mass)) : null;
}
