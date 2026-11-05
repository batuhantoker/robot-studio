/** Looping motions over a robot's whole joint vector. */
import type { Limb, RobotJoint } from '../chain/limbs/types';
import type { Transform } from '../math/linear/transform';
import type { Vec3 } from '../math/linear/vec';

export interface MotionRobot {
  joints: RobotJoint[];
  limbs: Limb[];
}

/** Copies of a planar pair of bars run beside the clip. */
export interface ClipFan {
  count: number;
  /** Where the first bar hangs from, in the robot's frame; the runs swing in its x-z plane. */
  pivot: Vec3;
  /** Each run's elbow and tip at time t: x, z, x, z, in the plane at the pivot's y. */
  at(t: number, out: Float32Array): void;
}

export interface MotionClip {
  period: number;
  /** Seconds of easing in from the starting pose; the loop follows. */
  lead?: number;
  /** Whole-robot joint vector at time t (seconds); loops every `period`, after any lead. */
  at(t: number): number[];
  /** The robot's own frame on the stage at time t, for a clip that carries the body; without it the robot settles on the floor. */
  body?(t: number): Transform;
  /** Joint rates at time t, for a clip that knows them exactly. */
  qd?(t: number): number[];
  fan?: ClipFan;
}

export interface FootShape {
  /** The points the foot stands on, in its tip frame. */
  sole: Vec3[];
  /** The tip-frame axis that points up when the foot stands flat. */
  up: Vec3;
  /** Joints past the foot, an ankle's linkage hanging off it, which a step leaves as they are. */
  past?: number[];
}

/** How a robot stands, read from its model: the floor in the robot's frame, and the feet by limb. */
export interface Footing {
  floor: number;
  feet: Map<number, FootShape>;
  /** Whether a pose touches, by the robot's own contact check, when it has one. */
  touches?: (q: number[]) => boolean;
}

export interface MotionPreset {
  id: string;
  label: string;
  hint: string;
  /** Build a clip around pose q0; `size` scales step lengths, radii and amplitudes (1 = default). */
  build(robot: MotionRobot, q0: number[], size: number): MotionClip;
}
