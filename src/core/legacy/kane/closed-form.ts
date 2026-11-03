/**
 * The AUTOLEV/Kane closed form for the original Z-X-Z-X arm (kinematics/4DOF_kane.all):
 * P_O_G = Laz·A3 + Lax·A1 + Lb·B1 + Lt·D3.
 */
import type { Vec3 } from '../../math/linear/vec';
import type { RobotSpec } from '../../robot/schema/types';

export interface KaneLengths {
  Laz: number;
  Lax: number;
  Lb: number;
  Lt: number;
}

export function kaneFK(q: ArrayLike<number>, L: KaneLengths): Vec3 {
  const [s1, s2, s3, s4] = [0, 1, 2, 3].map((i) => Math.sin(q[i]));
  const [c1, c2, c3, c4] = [0, 1, 2, 3].map((i) => Math.cos(q[i]));
  return [
    L.Lax * c1 + L.Lb * c1 + L.Lt * (s3 * s4 * c1 + s1 * (s2 * c4 + s4 * c2 * c3)),
    L.Lax * s1 + L.Lb * s1 + L.Lt * (s1 * s3 * s4 - c1 * (s2 * c4 + s4 * c2 * c3)),
    L.Laz + L.Lt * (c2 * c4 - s2 * s4 * c3),
  ];
}

const same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-12);

/** Lengths when the spec has the original arm's structure, otherwise null. */
export function kaneLengths(spec: RobotSpec): KaneLengths | null {
  const l = spec.links;
  const axes = [[0, 0, 1], [1, 0, 0], [0, 0, 1], [1, 0, 0]];
  if (l.length !== 4 || l.some((link, i) => link.joint !== 'revolute' || !same(link.axis, axes[i]))) return null;
  if (!same(spec.base, [0, 0, 0]) || !same(spec.tool, [0, 0, 0])) return null;
  const [o0, o1, o2, o3] = l.map((link) => link.offset);
  if (Math.abs(o0[1]) > 1e-12 || !same([o1[1], o1[2]], [0, 0]) || !same(o2, [0, 0, 0]) || !same([o3[0], o3[1]], [0, 0])) {
    return null;
  }
  return { Laz: o0[2], Lax: o0[0], Lb: o1[0], Lt: o3[2] };
}
