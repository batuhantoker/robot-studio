/** Effector kind → CAD builder. Register a builder here to add a new kind of tool. */
import type { EffectorKind } from '../../core/robot/schema/types';
import { parallelGripper } from '../parts/effectors/parallel';
import { suctionCup } from '../parts/effectors/suction';
import { threeFingerGripper } from '../parts/effectors/three-finger';
import { millingSpindle, toolFlange, weldingTorch } from '../parts/effectors/tools';
import type { EffectorBuilder } from '../parts/effectors/types';

export const EFFECTOR_BUILDERS: Record<EffectorKind, EffectorBuilder> = {
  parallel: parallelGripper,
  three_finger: threeFingerGripper,
  suction: suctionCup,
  torch: weldingTorch,
  spindle: millingSpindle,
  flange: toolFlange,
};
