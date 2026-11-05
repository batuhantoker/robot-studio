/** Session for a real robot: compiled from its own MJCF; every manifest chain becomes a limb. */
import { buildMjcfAssembly } from '../../cad/assembly/mjcf/build';
import { creaseOf, paintAssembly } from '../../cad/materials/paint/apply';
import { chainFrames } from '../../core/chain/kinematics/frames';
import { limbQ, mergeLimbs } from '../../core/chain/limbs/types';
import { bodyOf } from '../../core/motion/body';
import type { Vec3 } from '../../core/math/linear/vec';
import { jointsFor, motorMap } from '../../core/prosthesis/motors';
import { jointTorqueLimits } from '../../physics/extract/actuators';
import { modelChecker } from '../../physics/collision/from-model';
import { readBodies } from '../../physics/extract/bodies';
import { type ModelChain, chainFromModel } from '../../physics/extract/chain/from-model';
import { ModelHandle } from '../../physics/model/handle';
import { OBJ, arrays, state } from '../../physics/runtime/arrays';
import { toolSite, withXml } from '../../cad/assembly/mjcf/tool';
import { cadTitle } from '../library/entries';
import type { EffectorKind } from '../../core/robot/schema/types';
import { type CatalogChain, type CatalogRobot, fetchRobotFiles } from './catalog';
import { compileRobot } from './compile';
import { contactTol } from './contact';
import { fittedTool } from './fitted';
import { kinematicsAt, restingFloorZ } from './resting-floor';
import type { RobotSession } from './session';
import { retireGeoms, toolPlan, wakeHull } from './tools';

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

export async function sessionFromCatalog(robot: CatalogRobot, onProgress?: (d: number, t: number) => void, kind: EffectorKind | null = fittedTool(robot.id)): Promise<RobotSession> {
  const plan = toolPlan(robot, kind);
  const files = await fetchRobotFiles(robot, onProgress);
  const handle = await compileRobot(robot.id, plan ? withXml(files, robot.xml, plan.xml) : files, robot.xml);
  if (plan?.drawn) wakeHull(handle);
  if (plan?.hide) retireGeoms(handle, plan.hide);
  const manifest: CatalogChain[] = robot.chains?.length ? robot.chains : [robot.chain ?? { joints: [], tip: { body: rootBody(handle) } }];
  const specs = [...manifest, ...plan?.chains ?? []].map((c, i) => (plan?.limbs.includes(i) ? { ...c, tip: { site: toolSite(i) } } : c));
  const models = specs.map((c, i) => chainFromModel(handle, c.joints, c.tip, c.name ?? `chain ${i + 1}`));
  const { joints, limbs, keys } = mergeLimbs(models.map((mc, i) => ({ name: specs[i].name ?? `chain ${i + 1}`, chain: mc.chain, keys: mc.jointIds })));
  const m = arrays(handle.model);
  const rest = homeQpos(handle);
  const qposAdr = keys.map((j) => m.jnt_qposadr[j]);
  const clamped = qposAdr.map((adr, k) => Math.min(Math.max(plan?.home?.[joints[k].name] ?? rest[adr], joints[k].limits[0]), joints[k].limits[1]));
  const prosthesis = robot.prosthesis && motorMap(robot.prosthesis, joints);
  const home = prosthesis ? jointsFor(prosthesis, prosthesis.motors.map((mo) => mo.home), clamped) : clamped;
  const reach = Math.max(0.2, ...limbs.map((l) => Math.hypot(...chainFrames(l.chain, limbQ(l, home)).tip.p)));
  const assembly = buildMjcfAssembly(handle, readBodies(handle), models, reach, plan?.drawn, creaseOf(robot.id));
  paintAssembly(assembly, robot);
  if (plan) assembly.modules.push(...plan.modules);
  // Open on an arm (the right one of a pair) rather than whichever leg or wheel the manifest lists first.
  const body = bodyOf({ joints, limbs }, home, robot.category ?? 'arm');
  const { parts } = body;
  const arm = parts.find((p) => p.kind === 'arm' && p.side === 'right') ?? parts.find((p) => p.kind === 'arm');
  // A prosthesis opens on its manifest chain (the index finger), not on whichever finger reads as an arm.
  const lead = (robot.prosthesis ? undefined : arm?.limb) ?? Math.max(0, specs.findIndex((c) => sameChain(c, robot.chain)));
  // The readout and IK target belong on the working end: a limb with a tool over its part's other chains.
  const rigs = specs.map((_, i) => plan?.rig(i, handle, rest) ?? null);
  const tooled = rigs.flatMap((r, i) => (r ? [i] : []));
  const focus = !tooled.length || tooled.includes(lead) ? lead : tooled.find((l) => body.partOf[lead]?.limbs.includes(l)) ?? tooled[0];
  const base = robot.base ?? 'fixed';
  // Settled bases rest on this floor too, so the robot's frame and the world agree at home.
  kinematicsAt(handle, rest, qposAdr, home);
  // A fitted tool doesn't move the floor: the arm stays on its own feet.
  const drawn = plan?.drawn?.parts ?? [];
  drawn.forEach((t) => (t.group.visible = false));
  assembly.floorZ = restingFloorZ(assembly, limbs.map((l) => chainFrames(l.chain, limbQ(l, home))));
  drawn.forEach((t) => (t.group.visible = true));
  // Robots that settle on the ground are lifted onto it every frame; only bolted ones can dig in.
  const tools = drawn.map((t) => handle.id(OBJ.body, t.body));
  const collision = modelChecker(handle, { qposAdr, rest, home, floorZ: base === 'fixed' ? assembly.floorZ : null, tol: contactTol(reach), tools });
  return {
    id: robot.id, title: cadTitle(robot), source: 'cad', spec: null, category: robot.category ?? 'arm', base,
    joints, limbs, defaultFocus: focus, handle, assembly, qposAdr,
    dofAdr: keys.map((j) => m.jnt_dofadr[j]),
    torqueLimits: jointTorqueLimits(handle, keys),
    home, rest, collision, prosthesis, rigs,
    bareChains: plan ? manifest.map((c, i) => chainFromModel(handle, c.joints, c.tip, c.name ?? `chain ${i + 1}`).chain) : undefined,
    grips: rigs.some((r) => r?.grip) || !!prosthesis,
    fitted: plan?.drawn ? kind : null,
    mujocoTips: () => models.map((mc, i) => tipOf(handle, mc, specs[i].tip)),
    dispose() {
      collision.dispose();
      assembly.dispose();
      handle.dispose();
    },
  };
}
