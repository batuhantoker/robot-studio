/** Joint limits: a [lower, upper] pair per DOF; single-DOF joints use the bare pair like Python. */
import { JOINT_KINDS } from '../joints/kinds';
import { vector } from './numbers';
import { type JointKind, SpecError } from './types';

function pair(value: unknown): [number, number] {
  const [lo, hi] = vector(value, 2, 'limits');
  if (lo >= hi) throw new SpecError('limits must have lower < upper');
  return [lo, hi];
}

export function parseLimits(raw: unknown, kind: JointKind, name: string): [number, number][] {
  const templates = JOINT_KINDS[kind].dofs;
  if (raw === undefined) return templates.map((t) => [...t.limits]);
  if (templates.length === 1) return [pair(raw)];
  if (!Array.isArray(raw) || raw.length !== templates.length) {
    throw new SpecError(`${name}.limits must list ${templates.length} [lower, upper] pairs for a ${kind} joint`);
  }
  return raw.map(pair);
}
