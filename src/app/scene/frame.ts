/** Robot bases between the stage frame and the active robot's frame, where the active robot sits at the origin. */
import type { RobotBase } from '../state/types';

export const ORIGIN: RobotBase = { x: 0, y: 0, yaw: 0 };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** `base` as seen from `from`: where to draw it while `from` is at the origin. */
export function relativeBase(from: RobotBase, base: RobotBase): RobotBase {
  const dx = base.x - from.x, dy = base.y - from.y;
  const c = Math.cos(from.yaw), s = Math.sin(from.yaw);
  return { x: c * dx + s * dy, y: -s * dx + c * dy, yaw: wrap(base.yaw - from.yaw) };
}

/** Back to the stage frame: the inverse of relativeBase. */
export function stageBase(from: RobotBase, local: RobotBase): RobotBase {
  const c = Math.cos(from.yaw), s = Math.sin(from.yaw);
  return { x: from.x + c * local.x - s * local.y, y: from.y + s * local.x + c * local.y, yaw: wrap(from.yaw + local.yaw) };
}

/** A point drawn in `from`'s frame, redrawn in `to`'s frame so it stays put on the stage. */
export function reanchorPoint(from: RobotBase, to: RobotBase, x: number, y: number): [number, number] {
  const p = relativeBase(to, stageBase(from, { x, y, yaw: 0 }));
  return [p.x, p.y];
}

/** Radius about the active robot that takes in every other robot's bounding sphere. */
export function sceneRadius(active: number, others: { x: number; y: number; r: number }[]): number {
  return Math.max(active, ...others.map((o) => Math.hypot(o.x, o.y) + o.r));
}
