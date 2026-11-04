/** A bare adapter flange; when the tool point sits off it, a calibration pointer in a holder marks where. */
import { hullCylinder } from '../../common/hull';
import { lathe, solidCylinder } from '../../common/lathe';
import { part } from '../../common/part';
import { adapterPlate, opening, PLATE_FACE, SCREWS_OPEN, stackOpen, toolFrame } from './mount';
import type { EffectorBuilder } from './types';

export const toolFlange: EffectorBuilder = (o) => {
  const { g, s, along } = toolFrame(o, 0);
  const { mats } = o;
  const at = opening(s);
  if (along > s * 0.6) {
    const A = along / s;
    const [holderOpen, pointerOpen] = stackOpen([[PLATE_FACE, 0.42], [0.3, A]], PLATE_FACE + 0.05 + SCREWS_OPEN);
    g.add(
      part(lathe([[0, 0.3 * s], [0.08 * s, 0.3 * s], [0.08 * s, along - 0.25 * s], [0, along]], 24), mats, 'steel', { label: 'TCP pointer', layer: 'structure', explode: at(pointerOpen) }),
      part(lathe(solidCylinder(s * 0.2, s * PLATE_FACE, s * 0.42, s * 0.03), 32), mats, 'alu', { label: 'Pointer holder', layer: 'structure', explode: at(holderOpen) }),
      hullCylinder(s * 0.2, s * PLATE_FACE, along),
    );
  }
  adapterPlate(g, mats, s);
  return { group: g, grip: null, reach: Math.max(along, s * PLATE_FACE), payload: null };
};
