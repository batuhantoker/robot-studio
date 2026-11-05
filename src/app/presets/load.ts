/** Example robots: vendored from the 4-DOF study (presets/serial-arm) and the studio's own (presets/studio). */
import { parseRobot } from '@/core/robot/schema/parse';
import type { RobotSpec } from '@/core/robot/schema/types';

const files = import.meta.glob<Record<string, unknown>>(['../../../presets/serial-arm/*.json', '../../../presets/studio/*.json'], {
  eager: true,
  import: 'default',
});

/** Starting poses for the vendored presets, whose files must stay byte-identical to upstream. */
const VENDORED_HOME: Record<string, number[]> = {
  spatial_3link: [0, -0.75, 1.3],
  spatial_6link: [0, -0.75, 1.3, 0, -0.55, 0],
  spatial_12link: [0, -0.8, 0, 0.45, 0, 0.3, 0, 0.3, 0, 0.3, 0, 0.2],
};

export interface Preset {
  id: string;
  spec: RobotSpec;
}

export const PRESETS: Preset[] = Object.entries(files)
  .filter(([, raw]) => 'links' in raw)
  .map(([path, raw]) => {
    const id = path.split('/').pop()!.replace('.json', '');
    return { id, spec: { ...parseRobot(raw), ...(VENDORED_HOME[id] ? { home: VENDORED_HOME[id] } : {}) } };
  })
  .sort((a, b) => a.spec.links.length - b.spec.links.length);
