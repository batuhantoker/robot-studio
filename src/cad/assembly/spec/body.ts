/** What a robot's structure hands to the assembly. */
import type * as THREE from 'three';
import type { ChainFrames } from '../../../core/chain/model/types';
import { reachEstimate } from '../../../core/robot/config/pose';
import type { RobotSpec } from '../../../core/robot/schema/types';
import { moduleRadius } from '../../parts/types';
import type { ModuleInfo } from '../types';
import type { Gap, Slot } from './slots';

/** Thin Python-study wrists would carry millimetre tools; keep the tool in proportion to the arm. */
export const toolSize = (spec: RobotSpec) => Math.max(moduleRadius(spec.links[spec.links.length - 1]) * 0.55, 0.025 * reachEstimate(spec));

export interface SpecBody {
  slots: Slot[];
  modules: ModuleInfo[];
  gaps: Gap[];
  indicators: (THREE.Mesh | null)[];
  /** The last link's moving stage, which the tool rides. */
  lastStage: THREE.Group;
  /** Adds what stands on the floor, with the robot posed at `home`, and returns the floor's height. */
  stand(home: ChainFrames): number;
  /** Re-forms what follows the pose rather than riding one body. */
  follow(): void;
}
