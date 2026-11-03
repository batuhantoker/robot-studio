/** Lowest world z of a geom at the current kinematics: exact for primitives, bounding box for meshes. */
import type { MjData, MjModel } from '@mujoco/mujoco';
import { GEOM } from '../runtime/arrays';

type Num = ArrayLike<number>;

export function lowestZ(model: MjModel, data: MjData, g: number): number {
  const m = model as unknown as { geom_type: Num; geom_size: Num; geom_aabb: Num };
  const d = data as unknown as { geom_xpos: Num; geom_xmat: Num };
  const z = d.geom_xpos[3 * g + 2];
  // Row 2 of the rotation: the world-z component of each local axis.
  const r = [d.geom_xmat[9 * g + 6], d.geom_xmat[9 * g + 7], d.geom_xmat[9 * g + 8]];
  const [s0, s1, s2] = [m.geom_size[3 * g], m.geom_size[3 * g + 1], m.geom_size[3 * g + 2]];
  switch (m.geom_type[g]) {
    case GEOM.sphere: return z - s0;
    case GEOM.capsule: return z - Math.abs(r[2]) * s1 - s0;
    case GEOM.cylinder: return z - Math.abs(r[2]) * s1 - s0 * Math.sqrt(Math.max(0, 1 - r[2] * r[2]));
    case GEOM.box: return z - Math.abs(r[0]) * s0 - Math.abs(r[1]) * s1 - Math.abs(r[2]) * s2;
    case GEOM.ellipsoid: return z - Math.hypot(r[0] * s0, r[1] * s1, r[2] * s2);
  }
  const a = Array.from({ length: 6 }, (_, i) => m.geom_aabb[6 * g + i]);
  return z + r[0] * a[0] + r[1] * a[1] + r[2] * a[2] - Math.abs(r[0]) * a[3] - Math.abs(r[1]) * a[4] - Math.abs(r[2]) * a[5];
}
