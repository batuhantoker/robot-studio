/** Session for an edited CAD twin: twin spec physics, real meshes bound and stretched per link. */
import { buildHybridAssembly } from '../../cad/assembly/hybrid/build';
import { chainFrames } from '../../core/chain/kinematics/frames';
import { chainFromSpec } from '../../core/chain/model/from-spec';
import { singleLimb } from './single-limb';
import { toMjcf } from '../../core/mjcf/writer/serial-arm';
import { homePose, reachEstimate, specDofs } from '../../core/robot/config/pose';
import type { RobotSpec } from '../../core/robot/schema/types';
import { hullChecker } from '../../physics/collision/from-hull';
import { chainFromModel } from '../../physics/extract/chain/from-model';
import { ModelHandle } from '../../physics/model/handle';
import { OBJ, arrays, state } from '../../physics/runtime/arrays';
import type { TwinRef } from '../state/types';
import { type CatalogRobot, fetchRobotFiles } from './catalog';
import { contactTol, moduleLabel } from './contact';
import { restingFloorZ } from './resting-floor';
import type { RobotSession } from './session';
import { restTwin, twinScale } from './twin-rest';

export async function sessionFromTwin(id: string, spec: RobotSpec, ref: TwinRef, robot: CatalogRobot): Promise<RobotSession> {
  const cad = await ModelHandle.fromFiles(await fetchRobotFiles(robot), robot.xml);
  const source = robot.chains?.[ref.chainIndex] ?? robot.chain;
  if (!source) throw new Error(`${robot.title} has no movable chain to edit`);
  const mc = chainFromModel(cad, source.joints, source.tip, robot.id);
  const rest = restTwin(mc.chain, spec.name);
  const handle = await ModelHandle.fromXml(toMjcf(spec));
  const m = arrays(handle.model);
  const site = handle.id(OBJ.site, 'end_effector');
  const dofs = specDofs(spec);
  const assembly = buildHybridAssembly(spec, rest, cad, mc, twinScale(mc.chain));
  const chain = chainFromSpec(spec);
  const home = homePose(spec);
  assembly.floorZ = restingFloorZ(assembly, [chainFrames(chain, home)]);
  const collision = await hullChecker(chain, assembly.hull ?? [], {
    home, floorZ: assembly.floorZ, tol: contactTol(reachEstimate(spec)), label: moduleLabel(assembly),
  });
  return {
    id,
    title: spec.name,
    source: 'spec',
    category: 'arm',
    base: 'fixed',
    spec,
    ...singleLimb(chain),
    defaultFocus: 0,
    handle,
    assembly,
    qposAdr: dofs.map((d) => m.jnt_qposadr[handle.id(OBJ.joint, d.name)]),
    dofAdr: dofs.map((d) => m.jnt_dofadr[handle.id(OBJ.joint, d.name)]),
    home,
    torqueLimits: spec.links.flatMap((l) => l.dofs.map(() => l.torque_limit)),
    rest: Float64Array.from(m.qpos0),
    collision,
    mujocoTips: () => {
      const x = state(handle.data).site_xpos;
      return [[x[3 * site], x[3 * site + 1], x[3 * site + 2]]];
    },
    dispose() {
      collision?.dispose();
      assembly.dispose();
      handle.dispose();
      cad.dispose();
    },
  };
}
