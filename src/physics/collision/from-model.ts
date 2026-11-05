/**
 * Contact checker for imported CAD: the model's own collision geoms through MuJoCo's own filters.
 * Parent-child pairs stay filtered, since the real robot's joint limits already keep neighbours apart.
 */
import { readGeoms, visibleGeom } from '../extract/geoms';
import type { ModelHandle } from '../model/handle';
import { OBJ, arrays } from '../runtime/arrays';
import { CollisionChecker } from './checker';

export interface ModelCheckerOptions {
  qposAdr: number[];
  rest: Float64Array;
  home: number[];
  floorZ: number | null;
  tol: number;
  /** Bodies of fitted tools: their hull is hidden, because the tool is drawn by its parts, but it still stands on the floor. */
  tools?: number[];
}

export function modelChecker(h: ModelHandle, { floorZ, tools = [], ...o }: ModelCheckerOptions): CollisionChecker {
  const body = (g: number) => arrays(h.model).geom_bodyid[g];
  const shown = readGeoms(h).filter((g) => (visibleGeom(g) || tools.includes(g.body)) && g.body > 0).map((g) => g.id);
  return new CollisionChecker(h, {
    ...o,
    self: hasCollisionGeoms(h),
    label: (g) => h.name(OBJ.body, body(g)) || `body ${body(g)}`,
    floor: floorZ === null ? null : { z: floorZ, geoms: shown },
  }, false);
}

/** Whether the model has any geom MuJoCo would collide; without one only the floor is checked. */
function hasCollisionGeoms(h: ModelHandle): boolean {
  const m = h.model as unknown as { ngeom: number; geom_contype: ArrayLike<number>; geom_conaffinity: ArrayLike<number> };
  for (let g = 0; g < m.ngeom; g++) if (m.geom_contype[g] || m.geom_conaffinity[g]) return true;
  return false;
}
