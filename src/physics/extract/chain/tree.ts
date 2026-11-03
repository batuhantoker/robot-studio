/** Body-tree helpers: root-to-body paths and rigid transforms at the reference pose. */
import { type Transform, compose, identityTransform, quatToMat } from '../../../core/math/linear/transform';
import type { BodyInfo } from '../bodies';

export const bodyTransform = (b: BodyInfo): Transform => ({ R: quatToMat(b.quat), p: [...b.pos] });

/** Body ids from the world's first child down to `body`. */
export function pathTo(bodies: BodyInfo[], body: number): number[] {
  const path: number[] = [];
  for (let b = body; b > 0; b = bodies[b].parent) path.unshift(b);
  return path;
}

/** `ancestor` → `body` at the reference pose (joints at qpos0 are identities). */
export function relativeTransform(bodies: BodyInfo[], ancestor: number, body: number): Transform {
  const chain: number[] = [];
  for (let b = body; b !== ancestor; b = bodies[b].parent) {
    if (b <= 0) throw new Error(`body ${body} is not below body ${ancestor}`);
    chain.unshift(b);
  }
  return chain.reduce((T, b) => compose(T, bodyTransform(bodies[b])), identityTransform());
}

/** Nearest ancestor-or-self of `body` that satisfies `test`, or -1. */
export function nearest(bodies: BodyInfo[], body: number, test: (b: number) => boolean): number {
  for (let b = body; b > 0; b = bodies[b].parent) if (test(b)) return b;
  return -1;
}
