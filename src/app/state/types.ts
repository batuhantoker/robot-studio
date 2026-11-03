/** Everything the UI can change; panels read it, controllers react to it. */
import type { RobotSpec } from '../../core/robot/schema/types';
import type { Vec3 } from '../../core/math/linear/vec';
import type { Pace, StopOpts } from '../../core/trajectory/plan';
import type { Look } from '../../scene/look/types';
import type { Surroundings } from '../../scene/stage/surroundings';
import type { Cut } from '../../scene/teardown/materials';

export type Mode = 'pose' | 'motion' | 'pilot' | 'ik' | 'trajectory' | 'physics' | 'workspace' | 'task';

/** Pick and place: spots on the floor, and which one the gizmo and floor clicks move. */
export interface TaskState {
  pick: Vec3 | null;
  place: Vec3 | null;
  moving: 'pick' | 'place';
}

export interface MotionState {
  preset: string | null;
  speed: number;
  size: number;
}
export type RightTab = 'live' | 'math' | 'analysis';

export interface LibraryEntry {
  id: string;
  title: string;
  group: 'preset' | 'cad' | 'mine';
  subtitle: string;
  /** Movable DOF of the whole robot (all limbs, fingers). */
  dof: number;
  /** DOF of the chain the math follows, when it differs from `dof`. */
  chainDof: number;
  category: string;
  maker: string;
  tags: string[];
  /** No upstream license: kept on this machine only. */
  localOnly: boolean;
  spec?: RobotSpec;
  catalogId?: string;
  /** Editable twin of a CAD robot: its real meshes stay bound to the links. */
  twin?: TwinRef;
}

export interface TwinRef {
  catalogId: string;
  chainIndex: number;
}

export interface Overlays {
  frames: boolean;
  com: boolean;
  ellipsoid: boolean;
  trail: boolean;
  workspace: boolean;
  labels: boolean;
}

export interface StudioState {
  library: LibraryEntry[];
  activeId: string;
  /** Limb (leg, arm) the math panel explains; every limb stays live. */
  focus: number;
  /** Draft spec being edited in the builder (null for CAD robots). */
  draft: RobotSpec | null;
  draftError: string | null;
  loading: string | null;
  /** Bumped whenever a robot session (and its assembly) finishes loading. */
  sessionVersion: number;
  q: number[];
  mode: Mode;
  tab: RightTab;
  cut: Cut;
  look: Look;
  explode: number;
  isolate: string | null;
  overlays: Overlays;
  /** IK target per limb; null leaves that limb free. */
  targets: (Vec3 | null)[];
  waypoints: number[][];
  /** Selected trajectory stop: the playhead holds on it and edits (gizmo, sliders) move it. */
  selectedStop: number | null;
  /** Per stop: pass through (via) or rest, and for how long; kept in step with `waypoints`. */
  stopOpts: StopOpts[];
  pace: Pace;
  duration: number;
  playing: boolean;
  motion: MotionState;
  time: number;
  /** A video take of the trajectory is recording: playback runs once and stops at the end. */
  rendering: boolean;
  /** Backdrop and floor of the stage, saved in the browser. */
  surroundings: Surroundings;
  touring: boolean;
  /** What the last move ran into ("elbow ↔ floor"); null when nothing stopped it. */
  contact: string | null;
  task: TaskState;
  /** Robots on the stage; the active one's state lives in the flat fields above. */
  scene: SceneRobot[];
  activeKey: string;
}

/** Where a robot stands on the stage: metres, and radians about the vertical. */
export interface RobotBase {
  x: number;
  y: number;
  yaw: number;
}

/** The fields that belong to one robot, kept aside while another robot is active. */
export type Parked = Pick<StudioState, 'q' | 'focus' | 'waypoints' | 'stopOpts' | 'pace' | 'duration' | 'targets' | 'task' | 'motion' | 'selectedStop'>;

export interface SceneRobot {
  /** One placement; the same library entry can stand on the stage twice. */
  key: string;
  entryId: string;
  /** In the stage frame, never relative to the active robot. */
  base: RobotBase;
  /** Null for the active robot, and for one that hasn't been driven yet. */
  parked: Parked | null;
}
