import type { Snapshot } from '../../../app/live/bus';
import type { StudioState } from '../../../app/state/types';
import type { Limb } from '../../../core/chain/limbs/types';
import type { IkResult } from '../../../core/solvers/ik/types';

export interface MathContext {
  snap: Snapshot;
  state: StudioState;
  /** The focused limb, its slice of the joint vector, and the joint within it. */
  limb: Limb;
  lq: number[];
  joint: number;
  ik: IkResult | null;
}

export interface MathSection {
  id: string;
  title: string;
  /** Whether this section applies to the current robot. */
  applies?(ctx: MathContext): boolean;
  render(ctx: MathContext): (HTMLElement | null)[];
}
