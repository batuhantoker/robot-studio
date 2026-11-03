/** Example robots vendored from the 4-DOF study (see presets/serial-arm/PROVENANCE.md). */
import { parseRobot } from '@/core/robot/schema/parse';
import type { RobotSpec } from '@/core/robot/schema/types';

const files = import.meta.glob<Record<string, unknown>>('../../../presets/serial-arm/*.json', {
  eager: true,
  import: 'default',
});

export interface Preset {
  id: string;
  spec: RobotSpec;
}

export const PRESETS: Preset[] = Object.entries(files)
  .filter(([, raw]) => 'links' in raw)
  .map(([path, raw]) => ({ id: path.split('/').pop()!.replace('.json', ''), spec: parseRobot(raw) }))
  .sort((a, b) => a.spec.links.length - b.spec.links.length);
