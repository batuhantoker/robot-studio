/** A loaded robot: its limbs (explained chain math), the MuJoCo reference model, and its CAD. */
import type { DrivenRig } from '../../cad/assembly/mjcf/own-tools';
import type { Assembly } from '../../cad/assembly/types';
import { chainFrames } from '../../core/chain/kinematics/frames';
import { type Limb, type RobotJoint, limbQ } from '../../core/chain/limbs/types';
import type { Chain, ChainFrames } from '../../core/chain/model/types';
import type { Vec3 } from '../../core/math/linear/vec';
import type { MotorMap } from '../../core/prosthesis/motors';
import type { EffectorKind, RobotSpec } from '../../core/robot/schema/types';
import type { CollisionChecker } from '../../physics/collision/checker';
import type { ModelHandle } from '../../physics/model/handle';
import { state } from '../../physics/runtime/arrays';

export interface RobotSession {
  id: string;
  title: string;
  source: 'spec' | 'cad';
  /** arm, legged, humanoid, mobile, aerial…: picks the motion presets. */
  category: string;
  /** Floating and mobile bases settle on the ground; fixed bases are bolted down. */
  base: 'fixed' | 'floating' | 'mobile';
  spec: RobotSpec | null;
  /** The whole-robot joint vector every limb indexes into. */
  joints: RobotJoint[];
  limbs: Limb[];
  /** Limb shown first (a manifest's default chain). */
  defaultFocus: number;
  handle: ModelHandle;
  assembly: Assembly;
  /** Per robot joint: MuJoCo qpos/dof addresses and motor limit (0 when the model has none). */
  qposAdr: number[];
  dofAdr: number[];
  torqueLimits: number[];
  home: number[];
  /** Full qpos used for joints on no limb. */
  rest: Float64Array;
  /** Self-contact and floor test; null when the robot has nothing to collide. */
  collision: CollisionChecker | null;
  /** Prostheses only: the joints are posed through these motors, never one by one. */
  prosthesis?: MotorMap;
  /** Can really hold something: a fitted gripper, or its own driven hand. A torch, spindle or bare flange cannot. */
  grips: boolean;
  /** The tool on each limb; the empty slots carry none. */
  rigs: (DrivenRig | null)[];
  /** The kind fitted to a CAD arm, compiled into its model; null on a bare arm or one with its own tool. */
  fitted: EffectorKind | null;
  /** Each manifest limb as the CAD alone has it, without a tool's working end: what a twin is cut from. */
  bareChains?: Chain[];
  /** MuJoCo's position of each limb's tool point after `pose`. */
  mujocoTips(): Vec3[];
  dispose(): void;
}

export interface Posed {
  /** Frames of every limb, and of the focused one. */
  limbs: ChainFrames[];
  frames: ChainFrames;
  /** Worst |TS chain FK − MuJoCo| over all tool points, metres. */
  agreement: number;
}

/** Write a static pose into MuJoCo (velocities zeroed). Never call while a simulation owns the data. */
export function syncModel(s: RobotSession, q: number[]): void {
  const d = state(s.handle.data);
  d.qpos.set(s.rest);
  s.qposAdr.forEach((adr, k) => (d.qpos[adr] = q[k]));
  d.qvel.fill(0);
  s.handle.mj.mj_forward(s.handle.model, s.handle.data);
}

/** Pose the assembly; `sync: false` reads MuJoCo as the running simulation left it. */
export function pose(s: RobotSession, q: number[], explode: number, focus = 0, sync = true): Posed {
  if (sync) syncModel(s, q);
  const limbs = s.limbs.map((l) => chainFrames(l.chain, limbQ(l, q)));
  s.assembly.update(limbs, explode);
  const tips = s.mujocoTips();
  const agreement = Math.max(0, ...limbs.map((f, i) => Math.hypot(...f.tip.p.map((v, k) => v - tips[i][k]))));
  return { limbs, frames: limbs[Math.min(focus, limbs.length - 1)], agreement };
}

/** MuJoCo's bias force at each robot joint: the whole-robot static load when velocities are zero. */
export const mujocoBias = (s: RobotSession): number[] => s.dofAdr.map((adr) => state(s.handle.data).qfrc_bias[adr]);
