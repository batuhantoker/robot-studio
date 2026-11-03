/** Standard (Spong) Denavit–Hartenberg: A_i = Rot_z(θ_i) Trans_z(d_i) Trans_x(a_i) Rot_x(α_i). */
import type { Transform } from '../math/linear/transform';
import type { DofType } from '../robot/schema/types';

export interface DHRow {
  joint: string;
  type: DofType;
  /** θ at the reference pose; revolute joints add (q − q0). */
  theta: number;
  /** d at the reference pose; prismatic joints add (q − q0). */
  d: number;
  a: number;
  alpha: number;
  q0: number;
  /** Which geometric case placed this frame. */
  placement: 'skew' | 'intersecting' | 'parallel' | 'coincident';
}

export interface DHTable {
  rows: DHRow[];
  /** World → DH frame 0. */
  base: Transform;
  /** DH frame n → tool. */
  tool: Transform;
}
