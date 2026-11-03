/** A procedural joint module (and tube) for a twin link that no longer matches its CAD. */
import type { RobotSpec } from '../../../core/robot/schema/types';
import { JOINT_KINDS } from '../../../core/robot/joints/kinds';
import { v3 } from '../../common/orient';
import type { MaterialSet } from '../../materials/library';
import { buildTube } from '../../parts/links/tube';
import { JOINT_MODULES } from '../../registry/joint-modules';
import type { Slot } from '../spec/slots';
import type { ModuleInfo } from '../types';

export function proceduralLink(spec: RobotSpec, k: number, mats: MaterialSet, starts: number[], slots: Slot[], modules: ModuleInfo[]) {
  const link = spec.links[k];
  const m = JOINT_MODULES[link.joint]({ mats, link, index: k });
  const id = `joint:${link.name}`;
  m.stages.forEach((stage, i) => {
    stage.userData.module = id;
    slots.push({ group: stage, frame: (f) => (i === 0 ? f.pre[starts[k]] : f.frames[starts[k] + i - 1]), body: starts[k] + i - 1, before: starts[k] + i });
  });
  modules.push({ id, label: link.name, kind: `${JOINT_KINDS[link.joint].label} (procedural)`, joints: link.dofs.map((_, i) => starts[k] + i) });
  const offset = v3(link.offset);
  if (offset.lengthSq() > 0) {
    const tube = buildTube({ mats, offset, radius: link.radius, startTrim: m.exit(offset.clone().normalize()), endTrim: 0 });
    if (tube) {
      tube.userData.module = `link:${link.name}`;
      m.stages.at(-1)!.add(tube);
    }
  }
  return { stages: m.stages, size: m.size, indicators: link.dofs.map((_, i) => m.indicators[i] ?? null) };
}
