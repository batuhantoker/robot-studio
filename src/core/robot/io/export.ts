/** Serialize specs for `serial-arm-analyze` (strict) or the studio (all joint kinds). */
import { DEFAULT_EFFECTOR } from '../effectors/kinds';
import { JOINT_KINDS } from '../joints/kinds';
import { parseRobot } from '../schema/parse';
import { LINK_FIELDS, type LinkSpec, type RobotSpec, SpecError } from '../schema/types';

function linkDict(l: LinkSpec, studio: boolean): Record<string, unknown> {
  const limits = l.dofs.length === 1 ? [...l.dofs[0].limits] : l.dofs.map((d) => [...d.limits]);
  const values: Record<string, unknown> = {
    name: l.name, axis: [...l.axis], offset: [...l.offset], mass: l.mass, limits, radius: l.radius,
    damping: l.damping, armature: l.armature, torque_limit: l.torque_limit, kp: l.kp, kd: l.kd,
  };
  const out = Object.fromEntries(LINK_FIELDS.map((key) => [key, values[key]]));
  if (studio && l.joint !== 'revolute') {
    out.joint = l.joint;
    if (JOINT_KINDS[l.joint].dofs.some((t) => t.axis !== 'axis')) out.axis2 = [...l.axis2];
  }
  if (studio && l.continuous) out.continuous = true;
  if (studio && l.com && l.inertia) Object.assign(out, { com: [...l.com], inertia: [...l.inertia] });
  return out;
}

const robotDict = (spec: RobotSpec, studio: boolean) => ({
  name: spec.name,
  units: 'SI',
  base: [...spec.base],
  tool: [...spec.tool],
  payload_mass: spec.payload_mass,
  ...(studio && spec.effector !== DEFAULT_EFFECTOR ? { effector: spec.effector } : {}),
  links: spec.links.map((l) => linkDict(l, studio)),
  ...(studio && spec.home ? { home: [...spec.home] } : {}),
  ...(studio && spec.design ? { design: spec.design } : {}),
});

/** Why `serial-arm-analyze` would reject this robot, or null when it accepts it. */
export function pythonIncompatibility(spec: RobotSpec): string | null {
  const other = spec.links.filter((l) => l.joint !== 'revolute' || l.continuous || l.inertia).map((l) => `${l.name} (${l.inertia ? 'measured inertia' : l.continuous ? 'continuous' : l.joint})`);
  return other.length ? `serial-arm-analyze supports revolute joints only; not: ${other.join(', ')}` : null;
}

/** The exact `SerialArm.to_dict()` shape and key order. */
export function toPythonDict(spec: RobotSpec): Record<string, unknown> {
  const reason = pythonIncompatibility(spec);
  if (reason) throw new SpecError(reason);
  return robotDict(spec, false);
}

export const toStudioDict = (spec: RobotSpec): Record<string, unknown> => robotDict(spec, true);
export const cloneSpec = (spec: RobotSpec): RobotSpec => parseRobot(toStudioDict(spec));
