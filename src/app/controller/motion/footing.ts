/** How a loaded robot stands, read from its compiled model: its floor and the sole of each foot. */
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import { type Mat3, matVec, transpose } from '../../../core/math/linear/mat3';
import { type Vec3, add, scale, sub } from '../../../core/math/linear/vec';
import { type P2, convexHull } from '../../../core/math/planar/hull';
import type { FootShape, Footing } from '../../../core/motion/types';
import { GEOM, OBJ, arrays } from '../../../physics/runtime/arrays';
import { bodyFor } from '../../robots/body';
import { type RobotSession, syncModel } from '../../robots/session';

/** Depth of a sole's flat, as a share of the foot's length: tread and mesh noise count as standing on it. */
const FLAT = 0.02;
/** A link this far off the floor at home (m) is not what the robot stands on. */
const ABOVE = 0.01;
const UP: Vec3 = [0, 0, 1];

/** World points of a geom's outline, as far as a foot needs them: mesh vertices, box corners, a primitive's lowest point. */
function geomPoints(s: RobotSession, g: number): Vec3[] {
  const m = arrays(s.handle.model);
  const d = s.handle.data as unknown as { geom_xpos: Float64Array; geom_xmat: Float64Array };
  const p: Vec3 = [d.geom_xpos[3 * g], d.geom_xpos[3 * g + 1], d.geom_xpos[3 * g + 2]];
  const R = Array.from(d.geom_xmat.subarray(9 * g, 9 * g + 9)) as Mat3;
  const type = m.geom_type[g];
  const size: Vec3 = [m.geom_size[3 * g], m.geom_size[3 * g + 1], m.geom_size[3 * g + 2]];
  if (type === GEOM.mesh) {
    const mesh = m.geom_dataid[g], start = m.mesh_vertadr[mesh], count = m.mesh_vertnum[mesh];
    return Array.from({ length: count }, (_, i) => add(p, matVec(R, [0, 1, 2].map((k) => m.mesh_vert[3 * (start + i) + k]) as Vec3)));
  }
  if (type === GEOM.box) return Array.from({ length: 8 }, (_, i) => add(p, matVec(R, [i & 1 ? size[0] : -size[0], i & 2 ? size[1] : -size[1], i & 4 ? size[2] : -size[2]])));
  return type === GEOM.plane || type === GEOM.hfield ? [] : [sub(p, scale(UP, size[0]))];
}

function footShape(s: RobotSession, limb: number): FootShape | null {
  const l = s.limbs[limb], m = arrays(s.handle.model);
  const carried = (k: number) => {
    const joint = s.handle.id(OBJ.joint, s.joints[l.index[k]].name), root = joint < 0 ? -1 : m.jnt_bodyid[joint];
    const under = (b: number): boolean => b === root || (b > 0 && under(m.body_parentid[b]));
    return Array.from({ length: m.ngeom }, (_, g) => g).filter((g) => under(m.geom_bodyid[g]));
  };
  const reaches = (geoms: number[]) => geoms.some((g) => geomPoints(s, g).some((p) => p[2] < s.assembly.floorZ + ABOVE));
  // The foot is where the chain first stands on the floor: past it an ankle's linkage can hang, or a toe that does not bend for a step.
  let last = l.index.length - 1;
  while (last > 0 && !reaches(carried(last))) last--;
  while (last > 0 && reaches(carried(last - 1).filter((g) => !carried(last).includes(g)))) last--;
  const world = carried(last).flatMap((g) => geomPoints(s, g));
  if (!world.length) return null;
  const tip = chainFrames(l.chain, limbQ(l, s.home)).tip, Rt = transpose(tip.R);
  const low = Math.min(...world.map((p) => p[2]));
  const length = (list: Vec3[]) => Math.max(...list.map((p) => p[0])) - Math.min(...list.map((p) => p[0]));
  const span = length(world);
  // A foot that sits tipped at home touches along one edge: reach further up until the outline has real length.
  let flat = world.filter((p) => p[2] < low + FLAT * Math.max(span, 0.05));
  for (let reach = 2 * FLAT; length(flat) < 0.4 * span && reach < 0.3; reach *= 1.6) flat = world.filter((p) => p[2] < low + reach * span);
  // The outline is taken on the floor: a tip frame can lie at any angle to it.
  const hull = new Set(convexHull(flat.map((p): P2 => [p[0], p[1]])).map((p) => p.join()));
  // Flattened onto the lowest height: the outline's own points sit a little above it.
  const sole = flat.filter((p) => hull.delete(`${p[0]},${p[1]}`)).map((p): Vec3 => matVec(Rt, sub([p[0], p[1], low], tip.p)));
  return { sole, up: matVec(Rt, UP), past: l.index.slice(last + 1) };
}

const cache = new WeakMap<RobotSession, Footing>();

/** Only while building a clip: it poses the shared model, which the next frame poses again. */
export function footingOf(s: RobotSession): Footing {
  const known = cache.get(s);
  if (known) return known;
  syncModel(s, s.home);
  const feet = new Map<number, FootShape>();
  for (const p of bodyFor(s).parts) {
    if (p.kind !== 'leg') continue;
    const shape = footShape(s, p.limb);
    if (shape) feet.set(p.limb, shape);
  }
  const footing: Footing = { floor: s.assembly.floorZ, feet, touches: (q) => !!s.collision?.hit(q) };
  cache.set(s, footing);
  return footing;
}
