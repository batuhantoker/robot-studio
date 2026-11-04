/** Pick and place: the object handled, the tool the planner aims, and the planned cycle. */
import type { Transform } from '../math/linear/transform';
import type { Vec3 } from '../math/linear/vec';

export type TaskObjectKind = 'block' | 'can' | 'carton';

export interface TaskObject {
  kind: TaskObjectKind;
  label: string;
  /** Full extents in metres; a can's x and y are its diameter. */
  size: Vec3;
  /** Gripper opening that holds it, and the opening it is approached with. */
  hold: number;
  open: number;
  /** Working-end height above the floor while grasping. */
  graspZ: number;
  /** Paint of a part taken from the setting, so the stand-in matches it. */
  color?: string;
}

/** The tool as the planner sees it, in the last chain frame. */
export interface ToolGeometry {
  approach: Vec3;
  /** Direction the jaws close along; a block is turned to match. */
  side: Vec3;
  /** How far the working end sits past the tool point along the approach. */
  beyond: number;
}

export type ObjectState = { held: true; offset: Transform } | { held: false; pose: Transform };

export interface TaskClip {
  period: number;
  at(t: number): { q: number[]; gap: number };
  /** Resting on the floor, or riding the tool frame (`offset` from the tool point). */
  object(t: number): ObjectState;
}

export interface PlanProblem {
  /** Which spot or stretch failed, for the UI to colour. */
  where: 'pick' | 'place' | 'path';
  message: string;
}
