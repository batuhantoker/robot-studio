/** Procedural part roles mapped to material classes. */
import type { MaterialRole } from '../library';
import type { MaterialClass } from './types';

export const ROLE_CLASS: Record<MaterialRole, MaterialClass> = {
  shell: 'plastic', cap: 'anodized', alu: 'aluminium', steel: 'steel', copper: 'copper', magnet: 'anodized',
  rubber: 'rubber', brass: 'copper', pcb: 'electronics', accent: 'paint', payload: 'anodized',
};
