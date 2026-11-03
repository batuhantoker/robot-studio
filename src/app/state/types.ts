/** Everything the UI can change; panels read it, controllers react to it. */
import type { RobotSpec } from '../../core/robot/schema/types';
import type { Vec3 } from '../../core/math/linear/vec';
import type { Look } from '../../scene/look/types';
import type { Cut } from '../../scene/teardown/materials';

export type Mode = 'pose' | 'motion' | 'ik' | 'trajectory' | 'physics' | 'workspace';

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
  duration: number;
  playing: boolean;
  motion: MotionState;
  time: number;
  touring: boolean;
}
