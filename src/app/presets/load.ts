/** The library's robots: the studio's own (presets/studio) and the original arm of the 4-DOF study; the other serial-arm files are test fixtures. */
import { parseRobot } from '@/core/robot/schema/parse';
import type { RobotSpec } from '@/core/robot/schema/types';
import fourDof from '../../../presets/designs/original_4dof.json';

const files = import.meta.glob<Record<string, unknown>>(['../../../presets/serial-arm/original_4dof.json', '../../../presets/studio/*.json'], {
  eager: true,
  import: 'default',
});

export interface Preset {
  id: string;
  spec: RobotSpec;
}

export const PRESETS: Preset[] = Object.entries(files)
  .filter(([, raw]) => 'links' in raw)
  .map(([path, raw]) => {
    const id = path.split('/').pop()!.replace('.json', '');
    // That file stays byte-identical to the study, so how the arm is dressed lives beside it.
    return { id, spec: { ...parseRobot(raw), ...(id === 'original_4dof' ? (fourDof as unknown as Partial<RobotSpec>) : {}) } };
  })
  .sort((a, b) => a.spec.links.length - b.spec.links.length);
