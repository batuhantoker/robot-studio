/** User robots persist in localStorage as studio JSON (the same shape the export writes). */
import { toStudioDict } from '../../core/robot/io/export';
import { parseRobot } from '../../core/robot/schema/parse';
import { isEffectorKind } from '../../core/robot/effectors/kinds';
import type { EffectorKind, RobotSpec } from '../../core/robot/schema/types';
import type { TwinRef } from '../state/types';

const KEY = 'robot-studio.mine.v1';
const TOOLS_KEY = 'robot-studio.tools.v1';

export interface SavedRobot {
  id: string;
  spec: RobotSpec;
  twin?: TwinRef;
}

export function loadMine(): SavedRobot[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as { id: string; spec: unknown; twin?: TwinRef }[];
    return raw.flatMap((r) => {
      try {
        return [{ id: r.id, spec: parseRobot(r.spec), twin: r.twin }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function saveMine(robots: SavedRobot[]): void {
  localStorage.setItem(KEY, JSON.stringify(robots.map((r) => ({ id: r.id, spec: toStudioDict(r.spec), twin: r.twin }))));
}

/** Tools fitted to catalog arms, by catalog id. */
export function loadTools(): Record<string, EffectorKind> {
  try {
    const raw = JSON.parse(localStorage.getItem(TOOLS_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, EffectorKind] => isEffectorKind(e[1])));
  } catch {
    return {};
  }
}

export function saveTools(tools: Record<string, EffectorKind>): void {
  try {
    localStorage.setItem(TOOLS_KEY, JSON.stringify(tools));
  } catch {
    // Storage full or blocked: the tool stays for this visit and the address still carries it.
  }
}
