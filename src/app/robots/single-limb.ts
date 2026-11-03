/** Studio and twin robots are one serial chain: a single limb over all of its joints. */
import { mergeLimbs } from '../../core/chain/limbs/types';
import type { Chain } from '../../core/chain/model/types';

export const singleLimb = (chain: Chain) =>
  mergeLimbs([{ name: chain.name || 'arm', chain, keys: chain.joints.map((j) => j.name) }]);
