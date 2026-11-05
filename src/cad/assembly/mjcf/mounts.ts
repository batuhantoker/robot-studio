/** Where a tool bolts onto each catalog arm. `mounts.json` is measured from each model's last joint and flange mesh, then checked by eye. */
import type { Quat } from '../../../core/math/linear/transform';
import type { Vec3 } from '../../../core/math/linear/vec';
import table from './mounts.json';

export interface ToolMount {
  /** Manifest chain that ends at this flange. */
  limb: number;
  body: string;
  /** Flange centre in the body's frame. */
  pos: Vec3;
  /** Tool frame in the body's frame: +z leaves the flange. */
  quat: Quat;
}

export interface ArmFit {
  /** Drawing scale of a tool on this arm. */
  size: number;
  mounts: ToolMount[];
  /** Where the bare arm's home would bury a tool in the floor or the other arm, the joints that clear it. */
  home?: Record<string, number>;
  /** What a tool takes the place of: a regex of body, geom or mesh names, drawn and collided only on the bare arm. */
  hide?: string;
}

export const armFit = (id: string): ArmFit | null => (table as unknown as Record<string, ArmFit>)[id] ?? null;
