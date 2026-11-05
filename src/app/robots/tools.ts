/** What a catalog arm carries once compiled: a fitted studio tool, its own gripper, or nothing. */
import type { DrawnTools } from '../../cad/assembly/mjcf/build';
import { type ArmFit, type ToolMount, armFit } from '../../cad/assembly/mjcf/mounts';
import { type DrivenRig, ownRig, ownTool } from '../../cad/assembly/mjcf/own-tools';
import { buildRig, toolBody, toolPoint, toolSite } from '../../cad/assembly/mjcf/tool';
import type { ModuleInfo } from '../../cad/assembly/types';
import { MaterialSet } from '../../cad/materials/library';
import { nameSide } from '../../core/motion/body';
import { EFFECTOR_KINDS } from '../../core/robot/effectors/kinds';
import type { EffectorKind } from '../../core/robot/schema/types';
import { type GeomInfo, readGeoms } from '../../physics/extract/geoms';
import type { ModelHandle } from '../../physics/model/handle';
import { OBJ, arrays } from '../../physics/runtime/arrays';
import type { CatalogChain, CatalogRobot } from './catalog';

export interface ToolPlan {
  /** XML for the model, each piece inside its body. */
  xml: { body: string; xml: string }[];
  /** Chains whose tool point moves to the tool's working end. */
  limbs: number[];
  /** Chains the manifest lacks. */
  chains: CatalogChain[];
  drawn?: DrawnTools;
  /** What the tool replaces: a regex of body, geom or mesh names. */
  hide?: string;
  /** Joint values that give the tool room at home. */
  home?: Record<string, number>;
  /** Added after painting, so a fitted tool keeps its own finish. */
  modules: ModuleInfo[];
  rig(limb: number, h: ModelHandle, rest: Float64Array): DrivenRig | null;
}

/** "Left parallel gripper" on a pair of arms; contact messages name it. */
function toolTitle(kind: EffectorKind, robot: CatalogRobot, fit: ArmFit, m: ToolMount): string {
  if (fit.mounts.length < 2) return EFFECTOR_KINDS[kind].label;
  const side = nameSide(robot.chains?.[m.limb]?.name ?? '');
  const word = side && side !== 'centre' ? side[0].toUpperCase() + side.slice(1) : `Arm ${fit.mounts.indexOf(m) + 1}`;
  return `${word} ${EFFECTOR_KINDS[kind].label.toLowerCase()}`;
}

/** A model can ship its hull switched off (Apollo). The tool's geoms still have to meet it; the hull's geoms stay blind to each other. */
export function wakeHull(h: ModelHandle): void {
  const m = h.model as unknown as Record<'geom_contype' | 'geom_conaffinity' | 'body_conaffinity', number[]>;
  for (const g of readGeoms(h)) {
    if (g.group < 3 || m.geom_contype[g.id] || m.geom_conaffinity[g.id]) continue;
    m.geom_conaffinity[g.id] = 1;
    // The broadphase reads the per-body flags compiled from these.
    m.body_conaffinity[g.body] |= 1;
  }
}

/** Whether a geom is one of those a tool takes the place of: `pattern` matches its body, its own name or its mesh. */
export function geomRetires(h: ModelHandle, pattern: string): (g: GeomInfo) => boolean {
  const re = new RegExp(pattern);
  return (g) => [h.name(OBJ.body, g.body), g.name, g.mesh >= 0 ? h.name(OBJ.mesh, g.mesh) : ''].some((n) => re.test(n));
}

/** A hand the tool replaces stops being drawn and stops colliding; it stays in the model, so qpos and mass don't change. */
export function retireGeoms(h: ModelHandle, pattern: string): void {
  const retires = geomRetires(h, pattern), m = arrays(h.model) as unknown as Record<'geom_group' | 'geom_contype' | 'geom_conaffinity', number[]>;
  for (const g of readGeoms(h)) {
    if (!retires(g)) continue;
    m.geom_group[g.id] = 5;
    m.geom_contype[g.id] = m.geom_conaffinity[g.id] = 0;
  }
}

/** Null for a bare arm, or a robot no tool fits. A robot's own gripper always wins over a fitted kind. */
export function toolPlan(robot: CatalogRobot, kind: EffectorKind | null): ToolPlan | null {
  const own = ownTool(robot.id);
  if (own) {
    return {
      xml: own.mounts.map((m) => ({ body: m.body, xml: toolPoint(m) })),
      limbs: own.mounts.map((m) => m.limb),
      chains: own.mounts.flatMap((m) => (m.joints ? [{ name: m.body, joints: m.joints, tip: { site: toolSite(m.limb) } }] : [])),
      modules: [],
      rig: (limb, h, rest) => {
        const m = own.mounts.find((x) => x.limb === limb);
        return m ? ownRig(own, m, h, rest) : null;
      },
    };
  }
  const fit = kind && armFit(robot.id);
  if (!kind || !fit) return null;
  const mats = new MaterialSet();
  const tools = fit.mounts.map((m) => ({ m, name: toolTitle(kind, robot, fit, m), rig: buildRig(kind, fit.size, mats) }));
  tools.forEach((t) => (t.rig.group.userData.module = `tool:${t.m.limb}`));
  return {
    xml: tools.map((t) => ({ body: t.m.body, xml: toolBody(t.name, t.m, t.rig) })),
    limbs: tools.map((t) => t.m.limb),
    chains: [],
    home: fit.home,
    hide: fit.hide,
    drawn: { mats, parts: tools.map((t) => ({ body: t.name, group: t.rig.group })) },
    modules: tools.map((t) => ({ id: `tool:${t.m.limb}`, label: t.name, kind: 'End effector', joints: [], limb: t.m.limb })),
    rig: (limb) => tools.find((t) => t.m.limb === limb)?.rig ?? null,
  };
}
