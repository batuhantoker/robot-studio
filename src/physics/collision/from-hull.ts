/** Contact checker for studio and twin robots: their CAD's hull volumes compiled into a collision-only model. */
import type { Chain } from '../../core/chain/model/types';
import type { HullVolume } from '../../core/collision/hull';
import { hullMjcf } from '../../core/mjcf/writer/hull';
import { ModelHandle } from '../model/handle';
import { OBJ, arrays } from '../runtime/arrays';
import { CollisionChecker } from './checker';

export interface HullCheckerOptions {
  home: number[];
  /** Floor height, or null when the robot is not bolted down. */
  floorZ: number | null;
  tol: number;
  label: (module: string) => string;
}

export async function hullChecker(chain: Chain, hull: HullVolume[], o: HullCheckerOptions): Promise<CollisionChecker | null> {
  if (!hull.length) return null;
  const handle = await ModelHandle.fromXml(hullMjcf(chain, hull));
  const m = arrays(handle.model);
  // MuJoCo numbers geoms body by body, so map ids back through the h<i> names.
  const volume = Array.from({ length: m.ngeom }, (_, g) => hull[Number(handle.name(OBJ.geom, g).slice(1))]);
  const moving = volume.flatMap((v, g) => (v.body >= 0 ? [g] : []));
  return new CollisionChecker(handle, {
    qposAdr: chain.joints.map((_, k) => m.jnt_qposadr[k]),
    rest: Float64Array.from(m.qpos0),
    home: o.home,
    label: (g) => o.label(volume[g].module),
    floor: o.floorZ === null ? null : { z: o.floorZ, geoms: moving },
    tol: o.tol,
    self: true,
  }, true);
}
