/** Session for a real robot: compiled from its own MJCF; every manifest chain becomes a limb. */
import { buildMjcfAssembly } from '../../cad/assembly/mjcf/build';
import { chainFrames } from '../../core/chain/kinematics/frames';
import { limbQ, mergeLimbs } from '../../core/chain/limbs/types';
import type { Vec3 } from '../../core/math/linear/vec';
import { jointTorqueLimits } from '../../physics/extract/actuators';
import { readBodies } from '../../physics/extract/bodies';
import { type ModelChain, chainFromModel } from '../../physics/extract/chain/from-model';
import { ModelHandle } from '../../physics/model/handle';
import { OBJ, arrays, state } from '../../physics/runtime/arrays';
import { type CatalogChain, type CatalogRobot, fetchRobotFiles } from './catalog';
import type { RobotSession } from './session';

function homeQpos(h: ModelHandle): Float64Array {
  const m = h.model as unknown as { nkey: number; key_qpos: ArrayLike<number>; nq: number };
  const key = h.id(OBJ.key, 'home');
  return key >= 0 && key < m.nkey
    ? Float64Array.from({ length: m.nq }, (_, i) => m.key_qpos[key * m.nq + i])
    : Float64Array.from(arrays(h.model).qpos0);
}

/** First body under the world, the reference point for models with no movable chain. */
const rootBody = (h: ModelHandle): string => h.name(OBJ.body, Math.min(1, arrays(h.model).nbody - 1)) || 'world';

const sameChain = (a: CatalogChain, b: CatalogChain | null) => !!b && a.joints.join() === b.joints.join();

function tipOf(h: ModelHandle, mc: ModelChain, tip: CatalogChain['tip']): Vec3 {
  const d = state(h.data);
  if ('site' in tip) {
    const s = h.id(OBJ.site, tip.site);
    return [d.site_xpos[3 * s], d.site_xpos[3 * s + 1], d.site_xpos[3 * s + 2]];
  }
  const b = mc.tipBody;
  const [x, y, z] = mc.tipInBody;
  const r = (i: number) => (h.data as unknown as { xmat: Float64Array }).xmat[9 * b + i];
  return [0, 1, 2].map((k) => d.xpos[3 * b + k] + r(3 * k) * x + r(3 * k + 1) * y + r(3 * k + 2) * z) as Vec3;
}

export async function sessionFromCatalog(robot: CatalogRobot, onProgress?: (d: number, t: number) => void): Promise<RobotSession> {
  const handle = await ModelHandle.fromFiles(await fetchRobotFiles(robot, onProgress), robot.xml);
  const specs: CatalogChain[] = robot.chains?.length ? robot.chains : [robot.chain ?? { joints: [], tip: { body: rootBody(handle) } }];
  const models = specs.map((c, i) => chainFromModel(handle, c.joints, c.tip, c.name ?? `chain ${i + 1}`));
  const { joints, limbs, keys } = mergeLimbs(models.map((mc, i) => ({ name: specs[i].name ?? `chain ${i + 1}`, chain: mc.chain, keys: mc.jointIds })));
  const m = arrays(handle.model);
  const rest = homeQpos(handle);
  const qposAdr = keys.map((j) => m.jnt_qposadr[j]);
  const home = qposAdr.map((adr, k) => Math.min(Math.max(rest[adr], joints[k].limits[0]), joints[k].limits[1]));
  const reach = Math.max(0.2, ...limbs.map((l) => Math.hypot(...chainFrames(l.chain, limbQ(l, home)).tip.p)));
  const assembly = buildMjcfAssembly(handle, readBodies(handle), models, reach);
  const focus = Math.max(0, specs.findIndex((c) => sameChain(c, robot.chain)));
  return {
    id: robot.id, title: robot.title, source: 'cad', spec: null, category: robot.category ?? 'arm', base: robot.base ?? 'fixed',
    joints, limbs, defaultFocus: focus, handle, assembly, qposAdr,
    dofAdr: keys.map((j) => m.jnt_dofadr[j]),
    torqueLimits: jointTorqueLimits(handle, keys),
    home, rest,
    mujocoTips: () => models.map((mc, i) => tipOf(handle, mc, specs[i].tip)),
    dispose() {
      assembly.dispose();
      handle.dispose();
    },
  };
}
