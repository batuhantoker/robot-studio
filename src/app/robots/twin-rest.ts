/** The twin's rest state, rebuilt identically when it is created and every time it is loaded. */
import { chainFrames } from '../../core/chain/kinematics/frames';
import type { Chain } from '../../core/chain/model/types';
import { type Twin, twinFromChain } from '../../core/chain/twin/spec-from-chain';

export const twinScale = (chain: Chain) => Math.max(0.2, Math.hypot(...chainFrames(chain, chain.joints.map((j) => j.q0)).tip.p));

export function restTwin(chain: Chain, name: string, torqueLimit?: number[]): Twin {
  const r = Math.max(0.012, 0.04 * twinScale(chain));
  return twinFromChain(chain, { name, radius: chain.joints.map(() => r), torqueLimit });
}
