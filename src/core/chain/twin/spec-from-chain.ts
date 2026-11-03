/**
 * The editable "kinematic twin" of any chain: zero-pose world axes and anchor-to-anchor offsets.
 * With R_k(q) = S_k(q)·C_k (product of exponentials), positions match the chain for every q and
 * orientations differ only by the constant zero-pose tool rotation, which `toolRotation` records.
 */
import type { Mat3 } from '../../math/linear/mat3';
import { type Vec3, sub } from '../../math/linear/vec';
import type { JointKind, RobotSpec } from '../../robot/schema/types';
import { parseRobot } from '../../robot/schema/parse';
import { chainFrames, zeroPose } from '../kinematics/frames';
import type { Chain } from '../model/types';

export interface Twin {
  spec: RobotSpec;
  /** Zero-pose rotation of each chain joint's moving frame (C_k). */
  rotations: Mat3[];
  restOffsets: Vec3[];
  toolRotation: Mat3;
}

const safeName = (name: string, k: number) => {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `j${k}_${cleaned}`;
};

export function twinFromChain(chain: Chain, opts: { name: string; radius: number[]; torqueLimit?: number[] }): Twin {
  const q0 = zeroPose(chain);
  const f = chainFrames(chain, q0);
  const anchors = [...f.origins, f.tip.p];
  const restOffsets = chain.joints.map((_, k) => sub(anchors[k + 1], anchors[k]));
  const mass = chain.joints.map((_, k) => chain.masses.filter((m) => m.joint === k).reduce((s, m) => s + m.mass, 0));
  const spec = parseRobot({
    units: 'SI',
    name: opts.name,
    base: f.origins[0],
    tool: [0, 0, 0],
    // The CAD keeps its own hand; a procedural tool would double it.
    effector: 'flange',
    links: chain.joints.map((j, k) => {
      const link: Record<string, unknown> = {
        name: safeName(j.name, k),
        axis: f.axes[k],
        offset: restOffsets[k],
        mass: Math.max(mass[k], 1e-3),
        radius: Math.max(opts.radius[k] ?? 0.02, 0.005),
        limits: [j.limits[0] - j.q0, j.limits[1] - j.q0],
        torque_limit: opts.torqueLimit?.[k] || 50,
      };
      if (j.type === 'slide') link.joint = 'prismatic' satisfies JointKind;
      return link;
    }),
  });
  return { spec, rotations: f.frames.map((t) => t.R), restOffsets, toolRotation: f.tip.R };
}
