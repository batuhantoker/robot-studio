/** What the last link carries. Studio-only and visual: the tool point stays the spec's `tool` vector. */
import type { EffectorKind } from '../schema/types';

export interface EffectorInfo {
  kind: EffectorKind;
  label: string;
  use: string;
}

export const EFFECTOR_KINDS: Record<EffectorKind, EffectorInfo> = {
  parallel: { kind: 'parallel', label: 'Parallel gripper', use: 'Two jaws for boxes and machined parts' },
  three_finger: { kind: 'three_finger', label: 'Three-finger gripper', use: 'Self-centring grip on round parts' },
  suction: { kind: 'suction', label: 'Vacuum cup', use: 'Cartons, sheet metal and glass' },
  torch: { kind: 'torch', label: 'Welding torch', use: 'Arc welding along a seam' },
  spindle: { kind: 'spindle', label: 'Milling spindle', use: 'Drilling, milling and deburring' },
  flange: { kind: 'flange', label: 'Tool flange', use: 'Bare flange; a pointer marks an offset tool point' },
};

export const EFFECTOR_LIST = Object.values(EFFECTOR_KINDS);
export const DEFAULT_EFFECTOR: EffectorKind = 'parallel';
export const isEffectorKind = (v: unknown): v is EffectorKind => typeof v === 'string' && v in EFFECTOR_KINDS;
