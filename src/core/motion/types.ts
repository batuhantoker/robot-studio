/** Looping motions over a robot's whole joint vector. */
import type { Limb, RobotJoint } from '../chain/limbs/types';

export interface MotionRobot {
  joints: RobotJoint[];
  limbs: Limb[];
}

export interface MotionClip {
  period: number;
  /** Whole-robot joint vector at time t (seconds); loops every `period`. */
  at(t: number): number[];
}

export interface MotionPreset {
  id: string;
  label: string;
  hint: string;
  /** Build a clip around pose q0; `size` scales step lengths, radii and amplitudes (1 = default). */
  build(robot: MotionRobot, q0: number[], size: number): MotionClip;
}
