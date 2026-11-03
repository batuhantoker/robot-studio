import type { Vec3 } from '@/core/math/linear/vec';
import { toStudioDict } from '@/core/robot/io/export';
import { parseRobot } from '@/core/robot/schema/parse';
import type { EffectorKind } from '@/core/robot/schema/types';
import { presetSpec } from './fixtures';

/** spatial_3link carrying a given end effector, with a tool point far enough out for any of them. */
export const withEffector = (effector: EffectorKind, tool: Vec3 = [0.12, 0, 0]) =>
  parseRobot({ ...toStudioDict(presetSpec('spatial_3link')), effector, tool });

/** One link of every joint kind, with skewed axes and a payload. */
export const allJointsRobot = () => parseRobot({
  units: 'SI',
  name: 'all_joints',
  base: [0.02, -0.01, 0.1],
  tool: [0.03, 0, 0.02],
  payload_mass: 0.2,
  links: [
    { name: 'gantry', joint: 'planar', axis: [0, 0, 1], axis2: [1, 0.2, 0], offset: [0, 0, 0.12], mass: 1.1 },
    { name: 'column', joint: 'cylindrical', axis: [0, 0, 1], offset: [0.05, 0, 0.2], mass: 0.8 },
    { name: 'shoulder', joint: 'revolute', axis: [0, 1, 0], offset: [0.25, 0.02, 0], mass: 0.6 },
    { name: 'reach', joint: 'prismatic', axis: [1, 0, 0], offset: [0.1, 0, 0], mass: 0.3 },
    { name: 'cardan', joint: 'universal', axis: [0, 1, 0.3], axis2: [0, 0, 1], offset: [0.08, 0, 0], mass: 0.2 },
    { name: 'wrist', joint: 'spherical', axis: [1, 0, 0], axis2: [0, 1, 0], offset: [0, 0, 0.05], mass: 0.15 },
  ],
});
