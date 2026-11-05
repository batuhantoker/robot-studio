/** Grippers the catalog's arms already carry: the point between their jaws, and how a jaw opening maps onto finger joints. */
import * as THREE from 'three';
import type { Quat } from '../../../core/math/linear/transform';
import type { ModelHandle } from '../../../physics/model/handle';
import { OBJ, arrays } from '../../../physics/runtime/arrays';
import type { EffectorRig } from '../types';
import type { ToolMount } from './mounts';

/** One finger joint, linear in the opening between the pads. */
export interface Finger {
  joint: string;
  /** Joint value with the pads touching, and its change per metre of opening. */
  shut: number;
  per: number;
}

export interface OwnMount extends ToolMount {
  fingers: Finger[];
  /** An arm the manifest only lists through its fingers needs a chain of its own to the wrist. */
  joints?: string[];
}

/** A rig that moves model joints: a robot's own gripper, with its fingers by qpos address. */
export interface DrivenRig extends EffectorRig {
  fingers?: { adr: number; shut: number; per: number }[];
  /** Joint values Pick & place starts from, where the robot's own home is stowed. */
  ready?: Record<string, number>;
}

export interface OwnTool {
  name: string;
  size: number;
  /** Pad opening range (m). */
  grip: { min: number; max: number };
  mounts: OwnMount[];
  ready?: Record<string, number>;
}

// Tool frames: +z along the fingers, +x across the jaws, so an object's width lies between the pads.
const Z_TO_Y: Quat = [0.7071068, 0, 0, 0.7071068];
const X_FORWARD: Quat = [0.5, 0.5, 0.5, 0.5];
const pair = (a: string, b: string, per: number, shut = 0, signB = 1): Finger[] => [{ joint: a, shut, per }, { joint: b, shut: signB * shut, per: signB * per }];
const openArm = (side: string, per: number): Finger[] => pair(`openarm_${side}_finger_joint1`, `openarm_${side}_finger_joint2`, per);
const armJoints = (side: string) => [1, 2, 3, 4, 5, 6, 7].map((k) => `openarm_${side}_joint${k}`);
// A five-finger hand closes as one: every joint moves a share of its `full` curl, thumb against the fingers.
// Thumb and fingers each have their own `shut`, set so both meet the part's faces at the hold.
const curl = (g: number, shut: number, joints: [string, number][]): Finger[] => joints.map(([joint, full]) => ({ joint, shut: full * shut, per: -full / g }));
const starHand = (s: string) => [
  ...curl(0.288, 0.8173, [[`${s}_hand_thumb_bend_joint`, 1.2], [`${s}_hand_thumb_rota_joint1`, 0.8], [`${s}_hand_thumb_rota_joint2`, 0.8]]),
  ...curl(0.288, 0.8512, ['index', 'mid', 'ring', 'pinky'].flatMap((f): [string, number][] => [[`${s}_hand_${f}_joint1`, 1.2], [`${s}_hand_${f}_joint2`, 1.2]])),
];
const h2Hand = (s: string) => [
  ...curl(0.191, 0.6354, [[`${s}_thumb_CMC_FE`, 1.2], [`${s}_thumb_MCP_FE`, 0.8], [`${s}_thumb_IP`, 0.8]]),
  ...curl(0.191, 0.5742, ['index', 'middle', 'ring', 'pinky'].flatMap((f): [string, number][] => [[`${s}_${f}_MCP_FE`, 1], [`${s}_${f}_PIP`, 1], [`${s}_${f}_DIP`, 0.7]])),
];
const reachy = (p: string): Finger[] => [
  { joint: `${p}_hand_finger`, shut: 0.035, per: 22.1 },
  ...['proximal', 'proximal_mimic'].map((f) => ({ joint: `${p}_hand_finger_${f}`, shut: 0.5376, per: -10.36 })),
  ...['distal', 'distal_mimic'].map((f) => ({ joint: `${p}_hand_finger_${f}`, shut: -0.5376, per: 10.36 })),
];
const h2Arm = (s: string) => ['waist_yaw_joint', 'waist_roll_joint', 'waist_pitch_joint', ...['shoulder_pitch', 'shoulder_roll', 'shoulder_yaw', 'elbow', 'wrist_roll', 'wrist_pitch', 'wrist_yaw'].map((j) => `${s}_${j}_joint`)];
const dex1 = (s: string) => pair(`${s}_dex1_finger_joint_1`, `${s}_dex1_finger_joint_2`, 0.5, 0.001);
const nori = (s: string) => pair(`${s}_gripper_joint`, `${s}_gripper_idler_joint`, 6.37, 0, -1);
const aloha = (limb: number, side: string): OwnMount => ({
  limb, body: `${side}/gripper_link`, pos: [0.1461, 0, -0.0044], quat: X_FORWARD, fingers: pair(`${side}/left_finger`, `${side}/right_finger`, 0.5, 0.00785),
});

// Pad positions measured from each model across the fingers' travel. Hinged fingers are linearised around the hold.
const TOOLS: Record<string, OwnTool> = {
  franka_panda: {
    name: 'Franka Hand', size: 0.053, grip: { min: 0, max: 0.08 },
    mounts: [{ limb: 0, body: 'hand', pos: [0, 0, 0.1123], quat: Z_TO_Y, fingers: pair('finger_joint1', 'finger_joint2', 0.5) }],
  },
  'armor-franka': {
    name: 'Franka Hand', size: 0.053, grip: { min: 0, max: 0.08 },
    mounts: [{ limb: 0, body: 'fr3_hand', pos: [0, 0, 0.1123], quat: Z_TO_Y, fingers: pair('fr3_finger_joint1', 'fr3_finger_joint2', 0.5) }],
  },
  trossen_vx300s: {
    name: 'ViperX gripper', size: 0.04, grip: { min: 0.015, max: 0.087 },
    mounts: [{ limb: 0, body: 'gripper_link', pos: [0.1365, 0, 0], quat: X_FORWARD, fingers: pair('left_finger', 'right_finger', 0.5, 0.0135, -1) }],
  },
  aloha: { name: 'ALOHA gripper', size: 0.04, grip: { min: 0, max: 0.066 }, mounts: [aloha(0, 'left'), aloha(1, 'right')] },
  'armor-agilex-piper': {
    name: 'PiPER gripper', size: 0.04, grip: { min: 0, max: 0.07 },
    mounts: [{ limb: 0, body: 'gripper_base', pos: [0, 0, 0.1358], quat: Z_TO_Y, fingers: pair('joint7', 'joint8', 0.5, 0, -1) }],
  },
  'armor-openarm': {
    name: 'OpenArm gripper', size: 0.053, grip: { min: 0, max: 0.138 },
    mounts: [
      { limb: 0, body: 'openarm_left_ee_base_link', pos: [-0.0014, 0, -0.165], quat: [0, 0.7071068, 0.7071068, 0], fingers: openArm('left', 5.43) },
      { limb: 5, body: 'openarm_right_ee_base_link', pos: [-0.0014, 0, -0.165], quat: [0, 0.7071068, 0.7071068, 0], fingers: openArm('right', -5.43), joints: armJoints('right') },
    ],
  },
  google_robot: {
    name: 'Everyday Robots gripper', size: 0.067, grip: { min: 0, max: 0.14 },
    mounts: [{ limb: 0, body: 'link_gripper', pos: [0, 0, 0.16], quat: Z_TO_Y, fingers: [{ joint: 'joint_finger_right', shut: 1.061, per: -6.625 }, { joint: 'joint_finger_left', shut: 1.061, per: -6.625 }] }],
  },
  'armor-hello-robot-stretch-3': {
    name: 'Stretch gripper', size: 0.053, grip: { min: 0, max: 0.19 },
    // Stowed, the wrist folds against the base; unfolding it in one straight move would touch.
    ready: { joint_lift: 0.441, joint_arm_l3: 0.069, joint_arm_l2: 0.069, joint_arm_l1: 0.069, joint_arm_l0: 0.069, joint_wrist_yaw: 0.375, joint_wrist_pitch: -1.57, joint_wrist_roll: 0.437 },
    mounts: [{ limb: 0, body: 'link_gripper_s3_body', pos: [0, 0, 0.235], quat: [1, 0, 0, 0], fingers: [{ joint: 'joint_gripper_finger_right', shut: -0.0136, per: 2.96 }, { joint: 'joint_gripper_finger_left', shut: -0.0136, per: 2.96 }] }],
  },
  'armor-nori-a3': {
    name: 'Nori gripper', size: 0.053, grip: { min: 0, max: 0.13 },
    mounts: [
      { limb: 0, body: 'left_wrist_roll_link', pos: [0.0025, 0.0065, -0.118], quat: [0, 1, 0, 0], fingers: nori('left') },
      { limb: 8, body: 'right_wrist_roll_link', pos: [0.0025, -0.0065, -0.118], quat: [0, 1, 0, 0], fingers: nori('right'), joints: ['lift_extension_joint', ...['shoulder_pitch', 'shoulder_roll', 'bicep_yaw', 'elbow_pitch', 'forearm_yaw', 'wrist_pitch', 'wrist_roll'].map((j) => `right_${j}_joint`)] },
    ],
  },
  'armor-reachy2': {
    name: 'Reachy gripper', size: 0.04, grip: { min: 0, max: 0.1 },
    mounts: [
      { limb: 0, body: 'l_hand_palm_link', pos: [-0.0102, 0, 0.16], quat: Z_TO_Y, fingers: reachy('l') },
      { limb: 8, body: 'r_hand_palm_link', pos: [-0.0102, 0, 0.16], quat: Z_TO_Y, fingers: reachy('r'), joints: ['tripod_joint', ...['shoulder_pitch', 'shoulder_roll', 'elbow_yaw', 'elbow_pitch', 'wrist_roll', 'wrist_pitch', 'wrist_yaw'].map((j) => `r_${j}`)] },
    ],
  },
  'armor-unitree-r1d': {
    name: 'Dex1 gripper', size: 0.04, grip: { min: 0, max: 0.08 },
    mounts: [
      { limb: 0, body: 'left_dex1_base_link', pos: [0.1433, 0, 0], quat: X_FORWARD, fingers: dex1('left') },
      { limb: 8, body: 'right_dex1_base_link', pos: [0.1433, 0, 0], quat: X_FORWARD, fingers: dex1('right'), joints: ['lift_stage1_joint', 'lift_stage2_joint', 'waist_yaw_joint', ...['shoulder_pitch', 'shoulder_roll', 'shoulder_yaw', 'elbow', 'wrist_roll', 'wrist_pitch', 'wrist_yaw'].map((j) => `right_${j}_joint`)] },
    ],
  },
  // Palm down over the part, the fingers on one side and the thumb on the other.
  'armor-star1': {
    name: 'five-finger hand', size: 0.08, grip: { min: 0, max: 0.2 },
    mounts: [
      { limb: 13, body: 'left_hand_link', pos: [0.0506, -0.1, -0.1121], quat: [0.210815, 0.210815, 0.67495, -0.67495], fingers: starHand('left') },
      { limb: 14, body: 'right_hand_link', pos: [0.0506, 0.1, -0.1121], quat: [0.210815, -0.210815, 0.67495, 0.67495], fingers: starHand('right') },
    ],
  },
  'armor-unitree-h2-plus': {
    name: 'five-finger hand', size: 0.067, grip: { min: 0, max: 0.13 },
    mounts: [
      { limb: 13, body: 'left_hand_C_MC', pos: [0.0675, -0.0577, 0.1285], quat: [0.344422, 0.617554, 0.344422, 0.617554], fingers: h2Hand('left'), joints: h2Arm('left') },
      { limb: 14, body: 'right_hand_C_MC', pos: [0.0675, 0.0577, 0.1285], quat: [-0.344422, 0.617554, -0.344422, 0.617554], fingers: h2Hand('right'), joints: h2Arm('right') },
    ],
  },
  // One moving jaw: the tool point is the middle of the hold, not of the opening.
  unitree_z1: {
    name: 'Z1 gripper', size: 0.04, grip: { min: 0, max: 0.09 },
    mounts: [{ limb: 0, body: 'link06', pos: [0.19, 0, 0.006], quat: [0, 0.7071068, 0, 0.7071068], fingers: [{ joint: 'jointGripper', shut: 0, per: -14.1 }] }],
  },
  so101: {
    name: 'SO-101 gripper', size: 0.04, grip: { min: 0, max: 0.06 },
    mounts: [{ limb: 0, body: 'gripper', pos: [0.0071, -0.0002, -0.1], quat: [0, 1, 0, 0], fingers: [{ joint: 'gripper', shut: -0.2, per: 14.2 }] }],
  },
};

export const ownTool = (id: string): OwnTool | null => TOOLS[id] ?? null;

/** Bolted-on tools that are not grippers: nothing fits beside them, and they cannot hold. */
const FIXED: Record<string, string> = { 'armor-tattotronix': 'tattoo machine' };

export const fixedTool = (id: string): string | null => FIXED[id] ?? null;

/** Drives a gripper's joints through the session's `rest`; joints that are on a chain go through the pose instead. */
export function ownRig(own: OwnTool, m: OwnMount, h: ModelHandle, rest: Float64Array): DrivenRig {
  const a = arrays(h.model);
  const fingers = m.fingers.map((f) => ({ ...f, adr: a.jnt_qposadr[h.id(OBJ.joint, f.joint)] }));
  const set = (gap: number) => fingers.forEach((f) => (rest[f.adr] = f.shut + f.per * gap));
  const home = (rest[fingers[0].adr] - fingers[0].shut) / fingers[0].per;
  return {
    group: new THREE.Group(), reach: 0, payload: null, kind: 'parallel', size: own.size, fingers, ready: own.ready,
    grip: { ...own.grip, rest: home, set }, tool: { approach: [0, 0, 1], side: [1, 0, 0], beyond: 0 },
  };
}
