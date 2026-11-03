/** Configuration helpers over the flattened DOF vector. */
import type { DofSpec, RobotSpec } from '../schema/types';

export const specDofs = (spec: RobotSpec): DofSpec[] => spec.links.flatMap((l) => l.dofs);
export const dofLimits = (spec: RobotSpec): [number, number][] => specDofs(spec).map((d) => d.limits);

/** Zero clipped to limits, as in `analyze()`. */
export const homePose = (spec: RobotSpec): number[] =>
  dofLimits(spec).map(([lo, hi]) => Math.min(Math.max(0, lo), hi));

export const clipToLimits = (spec: RobotSpec, q: number[]): number[] =>
  dofLimits(spec).map(([lo, hi], i) => Math.min(Math.max(q[i], lo), hi));

/** Upper bound on tool distance from the base point. */
export const reachEstimate = (spec: RobotSpec): number =>
  spec.links.reduce((s, l) => {
    const stroke = l.dofs.filter((d) => d.type === 'slide').reduce((m, d) => m + Math.max(...d.limits.map(Math.abs)), 0);
    return s + Math.hypot(...l.offset) + stroke;
  }, 0) + Math.hypot(...spec.tool);
