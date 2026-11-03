/** Validate and normalize robot configurations the way SerialArm.from_dict does. */
import { DEFAULT_EFFECTOR, isEffectorKind } from '../effectors/kinds';
import { expandDofs, secondaryAxis } from '../joints/expand';
import { isJointKind } from '../joints/kinds';
import { parseLimits } from './limits';
import { isObject, normalizeAxis, number, triple } from './numbers';
import { LINK_DEFAULTS, LINK_FIELDS, type LinkSpec, type RobotSpec, STUDIO_LINK_FIELDS, SpecError } from './types';

const ROBOT_KEYS = new Set(['name', 'units', 'base', 'tool', 'payload_mass', 'effector', 'links']);
const LINK_KEYS = new Set<string>([...LINK_FIELDS, ...STUDIO_LINK_FIELDS]);
const REQUIRED = ['name', 'axis', 'offset', 'mass'];
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

function parseLink(raw: unknown, index: number): LinkSpec {
  if (!isObject(raw)) throw new SpecError(`links[${index}] must be an object`);
  const unknown = Object.keys(raw).filter((k) => !LINK_KEYS.has(k));
  if (unknown.length) throw new SpecError(`unknown link keys: ${unknown.join(', ')}`);
  const missing = REQUIRED.filter((k) => !(k in raw));
  if (missing.length) throw new SpecError(`links[${index}] missing required keys: ${missing.join(', ')}`);
  const name = raw.name;
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new SpecError('link name must be a safe identifier');
  const joint = raw.joint ?? 'revolute';
  if (!isJointKind(joint)) throw new SpecError(`${name}.joint must be a known joint kind`);
  const axis = normalizeAxis(triple(raw.axis, `${name}.axis`), name);
  const rawAxis2 = raw.axis2 === undefined ? undefined : normalizeAxis(triple(raw.axis2, `${name}.axis2`), `${name}.axis2`);
  const axis2 = secondaryAxis(axis, rawAxis2, name);
  const pick = (key: keyof typeof LINK_DEFAULTS) => (key in raw ? raw[key] : LINK_DEFAULTS[key]);
  return {
    name,
    joint,
    axis,
    axis2,
    offset: triple(raw.offset, 'offset'),
    mass: number(raw.mass, 'mass', { positive: true }),
    radius: number(pick('radius'), 'radius', { positive: true }),
    damping: number(pick('damping'), 'damping', { minimum: 0 }),
    armature: number(pick('armature'), 'armature', { minimum: 0 }),
    torque_limit: number(pick('torque_limit'), 'torque_limit', { positive: true }),
    kp: number(pick('kp'), 'kp', { positive: true }),
    kd: number(pick('kd'), 'kd', { minimum: 0 }),
    dofs: expandDofs(name, joint, axis, axis2, parseLimits(raw.limits, joint, name)),
  };
}

/** Robot-only configuration; scenario keys are rejected. */
export function parseRobot(raw: unknown): RobotSpec {
  if (!isObject(raw)) throw new SpecError('robot configuration must be an object');
  const unknown = Object.keys(raw).filter((k) => !ROBOT_KEYS.has(k));
  if (unknown.length) throw new SpecError(`unknown robot keys: ${unknown.join(', ')}`);
  if (raw.units !== 'SI') throw new SpecError("units must be exactly 'SI'");
  if (!Array.isArray(raw.links) || raw.links.length === 0) throw new SpecError('links must be a nonempty array');
  const links = raw.links.map(parseLink);
  if (new Set(links.map((l) => l.name)).size !== links.length) throw new SpecError('link names must be unique');
  const dofNames = links.flatMap((l) => l.dofs.map((d) => d.name));
  if (new Set(dofNames).size !== dofNames.length) throw new SpecError('joint DOF names must be unique');
  const name = raw.name ?? 'serial_arm';
  if (typeof name !== 'string' || !name.trim()) throw new SpecError('name must be a nonempty string');
  const effector = raw.effector ?? DEFAULT_EFFECTOR;
  if (!isEffectorKind(effector)) throw new SpecError('effector must be a known end effector');
  return {
    name,
    units: 'SI',
    base: triple(raw.base ?? [0, 0, 0], 'base'),
    tool: triple(raw.tool ?? [0, 0, 0], 'tool'),
    payload_mass: number(raw.payload_mass ?? 0, 'payload_mass', { minimum: 0 }),
    effector,
    links,
  };
}
