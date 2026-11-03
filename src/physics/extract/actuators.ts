/** Joint torque limits from the actuators that drive each joint (force range × gear). */
import type { ModelHandle } from '../model/handle';
import { arrays } from '../runtime/arrays';

export function jointTorqueLimits(h: ModelHandle, jointIds: number[]): number[] {
  const m = arrays(h.model) as ReturnType<typeof arrays> & { actuator_forcelimited: ArrayLike<number>; actuator_trntype: ArrayLike<number> };
  return jointIds.map((j) => {
    let limit = 0;
    for (let a = 0; a < m.nu; a++) {
      // trntype 0 is mjTRN_JOINT; tendon/site transmissions are not attributed to one joint.
      if (m.actuator_trntype[a] !== 0 || m.actuator_trnid[2 * a] !== j || !m.actuator_forcelimited[a]) continue;
      const range = Math.max(Math.abs(m.actuator_forcerange[2 * a]), Math.abs(m.actuator_forcerange[2 * a + 1]));
      limit = Math.max(limit, range * Math.abs(m.actuator_gear[6 * a]));
    }
    return limit;
  });
}
