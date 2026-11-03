/**
 * Collision-only MJCF for a chain: one body per chain joint carrying the CAD's hull volumes.
 * Never simulated; it only answers "does this pose touch?". The physics MJCF stays untouched.
 */
import type { HullVolume } from '../../collision/hull';
import type { Chain } from '../../chain/model/types';
import { compose, matToQuat } from '../../math/linear/transform';
import { g17List } from '../format/numbers';
import { type XmlNode, child, node, serialize } from '../format/xml';

export function hullMjcf(chain: Chain, hull: HullVolume[]): string {
  const root = node('mujoco', { model: `${chain.name}_hull` });
  child(root, 'compiler', { angle: 'radian' });
  // Only contacts live in the arena; the 13 MB default would be wasted per robot.
  child(root, 'size', { memory: '2M' });
  // MuJoCo skips parent-child pairs by default; folding a forearm onto its upper arm is exactly that pair.
  child(child(root, 'option'), 'flag', { filterparent: 'disable' });
  child(child(root, 'default'), 'geom', { contype: '1', conaffinity: '1', margin: '0' });
  const bodies: XmlNode[] = [child(root, 'worldbody')];
  chain.joints.forEach((j, k) => {
    const T = k === 0 ? compose(chain.base, j.fixed) : j.fixed;
    const body = child(bodies[k], 'body', { name: `b${k}`, pos: g17List(T.p), quat: g17List(matToQuat(T.R)) });
    child(body, 'inertial', { pos: '0 0 0', mass: '1', diaginertia: '1 1 1' });
    child(body, 'joint', { name: `j${k}`, type: j.type, axis: g17List(j.axis), ref: g17List([j.q0]) });
    bodies.push(body);
  });
  hull.forEach((v, i) => child(bodies[v.body + 1], 'geom', {
    name: `h${i}`, type: v.shape, size: g17List(v.size), pos: g17List(v.pose.p), quat: g17List(matToQuat(v.pose.R)),
  }));
  return serialize(root);
}
