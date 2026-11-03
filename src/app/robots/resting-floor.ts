/** A bolted robot stands on its floor at home: the floor goes under its lowest solid point there. */
import type { Assembly } from '../../cad/assembly/types';
import { lowestSolidZ } from '../../cad/common/lowest';
import type { ChainFrames } from '../../core/chain/model/types';
import type { ModelHandle } from '../../physics/model/handle';
import { state } from '../../physics/runtime/arrays';

export function restingFloorZ(assembly: Assembly, home: ChainFrames[]): number {
  assembly.update(home, 0);
  const z = lowestSolidZ(assembly.root);
  return Number.isFinite(z) ? z : assembly.floorZ;
}

/** Imported assemblies read body poses from MuJoCo, so it must sit at the pose first. */
export function kinematicsAt(h: ModelHandle, rest: Float64Array, qposAdr: number[], q: number[]): void {
  const d = state(h.data);
  d.qpos.set(rest);
  qposAdr.forEach((adr, k) => (d.qpos[adr] = q[k]));
  h.mj.mj_kinematics(h.model, h.data);
}
