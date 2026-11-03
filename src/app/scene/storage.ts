/** A stage with several robots persists in localStorage; a lone robot starts fresh on reload, as it always has. */
import type { LibraryEntry, RobotBase, SceneRobot } from '../state/types';
import { isParked } from './parked';

const KEY = 'robot-studio.scene.v1';
export const MAIN_KEY = 'main';

export interface SavedScene {
  activeKey: string;
  robots: SceneRobot[];
}

const isBase = (b: unknown): b is RobotBase =>
  !!b && typeof b === 'object' && (['x', 'y', 'yaw'] as const).every((k) => Number.isFinite((b as RobotBase)[k]));

/** The saved stage, when at least two of its robots are still in the library. */
export function restoreScene(library: LibraryEntry[]): SavedScene | null {
  let raw: Partial<SavedScene> | null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
  const ids = new Set(library.map((e) => e.id));
  const keys = new Set<string>();
  const robots: SceneRobot[] = [];
  for (const r of Array.isArray(raw?.robots) ? raw.robots : []) {
    if (typeof r?.key !== 'string' || keys.has(r.key) || !ids.has(r.entryId) || !isBase(r.base)) continue;
    keys.add(r.key);
    robots.push({ key: r.key, entryId: r.entryId, base: { x: r.base.x, y: r.base.y, yaw: r.base.yaw }, parked: isParked(r.parked) ? r.parked : null });
  }
  if (robots.length < 2) return null;
  const activeKey = keys.has(raw!.activeKey!) ? raw!.activeKey! : robots[0].key;
  return { activeKey, robots: robots.map((r) => (r.key === activeKey ? { ...r, parked: null } : r)) };
}

export function saveScene(robots: SceneRobot[], activeKey: string): void {
  try {
    if (robots.length < 2) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ activeKey, robots }));
  } catch {
    // Storage full or blocked: the stage still works, it just won't come back on reload.
  }
}
