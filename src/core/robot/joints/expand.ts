/** Expand a link's joint kind into elementary DOFs with orthonormal axes. */
import { type Vec3, cross, dot, norm, normalize, perpendicular, scale, sub } from '../../math/linear/vec';
import { type DofSpec, type JointKind, SpecError } from '../schema/types';
import { type AxisRole, JOINT_KINDS, dofName } from './kinds';

/** Gram–Schmidt axis2 against axis; defaults to a perpendicular when absent. */
export function secondaryAxis(axis: Vec3, axis2: Vec3 | undefined, name: string): Vec3 {
  if (!axis2) return perpendicular(axis);
  const v = sub(axis2, scale(axis, dot(axis2, axis)));
  if (norm(v) < 1e-9 * Math.max(norm(axis2), 1)) throw new SpecError(`${name}.axis2 must not be parallel to axis`);
  return normalize(v);
}

export function expandDofs(
  name: string,
  kind: JointKind,
  axis: Vec3,
  axis2: Vec3,
  limits?: [number, number][],
): DofSpec[] {
  const axes: Record<AxisRole, Vec3> = { axis, axis2, axis3: cross(axis, axis2) };
  return JOINT_KINDS[kind].dofs.map((t, i) => ({
    name: dofName(name, t),
    type: t.type,
    axis: axes[t.axis],
    limits: limits?.[i] ?? t.limits,
  }));
}
