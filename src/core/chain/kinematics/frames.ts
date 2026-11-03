/** Forward kinematics along a chain. */
import { identity3, matVec, rodrigues } from '../../math/linear/mat3';
import { type Transform, applyTransform, compose } from '../../math/linear/transform';
import { type Vec3, scale } from '../../math/linear/vec';
import type { Chain, ChainFrames, ChainJoint } from '../model/types';

export function motion(joint: ChainJoint, q: number): Transform {
  const d = q - joint.q0;
  return joint.type === 'hinge'
    ? { R: rodrigues(joint.axis, d), p: [0, 0, 0] }
    : { R: identity3(), p: scale(joint.axis, d) };
}

export function chainFrames(chain: Chain, q: ArrayLike<number>): ChainFrames {
  let T = chain.base;
  const out: ChainFrames = { origins: [], axes: [], pre: [], frames: [], tip: T };
  chain.joints.forEach((joint, k) => {
    T = compose(T, joint.fixed);
    out.pre.push(T);
    out.origins.push(T.p);
    out.axes.push(matVec(T.R, joint.axis));
    T = compose(T, motion(joint, q[k]));
    out.frames.push(T);
  });
  out.tip = compose(T, chain.tip);
  return out;
}

export const forwardKinematics = (chain: Chain, q: ArrayLike<number>): Transform => chainFrames(chain, q).tip;

export const zeroPose = (chain: Chain): number[] => chain.joints.map((j) => j.q0);

export function massPositions(chain: Chain, f: ChainFrames): Vec3[] {
  return chain.masses.map((m) => applyTransform(m.joint < 0 ? chain.base : f.frames[m.joint], m.com));
}
