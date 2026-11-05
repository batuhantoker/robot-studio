/** What the last link carries. Studio-only and visual: the tool point stays the spec's `tool` vector. */
import type { EffectorKind } from '../schema/types';

export interface EffectorInfo {
  kind: EffectorKind;
  label: string;
  use: string;
  /** Can it hold an object? */
  grips: boolean;
}

export const EFFECTOR_KINDS: Record<EffectorKind, EffectorInfo> = {
  parallel: { kind: 'parallel', grips: true, label: 'Parallel gripper', use: 'Two jaws for boxes and machined parts' },
  three_finger: { kind: 'three_finger', grips: true, label: 'Three-finger gripper', use: 'Self-centring grip on round parts' },
  suction: { kind: 'suction', grips: true, label: 'Vacuum cup', use: 'Cartons, sheet metal and glass' },
  torch: { kind: 'torch', grips: false, label: 'Welding torch', use: 'Arc welding along a seam' },
  spindle: { kind: 'spindle', grips: false, label: 'Milling spindle', use: 'Drilling, milling and deburring' },
  flange: { kind: 'flange', grips: false, label: 'Tool flange', use: 'Bare flange; a pointer marks an offset tool point' },
};

export const EFFECTOR_LIST = Object.values(EFFECTOR_KINDS);
export const DEFAULT_EFFECTOR: EffectorKind = 'parallel';
export const isEffectorKind = (v: unknown): v is EffectorKind => typeof v === 'string' && v in EFFECTOR_KINDS;
