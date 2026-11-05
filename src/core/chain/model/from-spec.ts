/** Compile a studio/Python robot spec to the general chain form, one chain joint per DOF. */
import { applyTransform, identityTransform, translation } from '../../math/linear/transform';
import { type Vec3, add, scale } from '../../math/linear/vec';
import type { RobotSpec } from '../../robot/schema/types';
import { chainFrames } from '../kinematics/frames';
import type { Chain, ChainJoint, ChainMass } from './types';

/** SerialArm: move through the link's DOFs, then translate by its offset. */
export function chainFromSpec(spec: RobotSpec): Chain {
  const joints: ChainJoint[] = [];
  const masses: ChainMass[] = [];
  spec.links.forEach((link, k) => {
    link.dofs.forEach((dof, i) => joints.push({
      name: dof.name,
      type: dof.type,
      fixed: k > 0 && i === 0 ? translation(spec.links[k - 1].offset) : identityTransform(),
      axis: dof.axis,
      limits: dof.limits,
      q0: 0,
      ...(link.continuous ? { continuous: true } : {}),
    }));
    // Uniform capsules span 0 → offset; zero-length links are spheres at the joint.
    const com: Vec3 = link.offset.some((v) => v !== 0) ? scale(link.offset, 0.5) : [0, 0, 0];
    masses.push({ name: link.name, mass: link.mass, com, joint: joints.length - 1 });
  });
  const last = spec.links[spec.links.length - 1];
  if (spec.payload_mass > 0) {
    masses.push({ name: 'payload', mass: spec.payload_mass, com: add(last.offset, spec.tool), joint: joints.length - 1 });
  }
  return {
    name: spec.name,
    base: translation(spec.base),
    joints,
    tip: translation(add(last.offset, spec.tool)),
    masses,
    gravity: [0, 0, -9.81],
  };
}

/** Index of each link's first chain joint. */
export const linkJointStart = (spec: RobotSpec): number[] => {
  let k = 0;
  return spec.links.map((l) => ((k += l.dofs.length), k - l.dofs.length));
};

/** `SerialArm.joint_positions`: each link's joint origin, final link end, tool tip. */
export function specJointPositions(spec: RobotSpec, chain: Chain, q: ArrayLike<number>): Vec3[] {
  const f = chainFrames(chain, q);
  const origins = linkJointStart(spec).map((k) => f.origins[k]);
  const end = applyTransform(f.frames[f.frames.length - 1], spec.links[spec.links.length - 1].offset);
  return [...origins, end, f.tip.p];
}
