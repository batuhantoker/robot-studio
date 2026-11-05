/** Tool paths for arms, drawn in each arm's outward-facing vertical plane. */
import type { Vec3 } from '../../math/linear/vec';
import type { LimbRole } from '../roles';
import { at, workFrame } from './frame';

type Path = (s: number) => Vec3;
const TAU = Math.PI * 2;

export function circle(r: LimbRole, size: number): Path {
  const f = workFrame(r), R = size * 0.16 * f.reach;
  return (s) => at(f, 0, R * Math.cos(TAU * s), R * Math.sin(TAU * s));
}

export function figureEight(r: LimbRole, size: number): Path {
  const f = workFrame(r), R = size * 0.2 * f.reach;
  return (s) => at(f, 0, R * Math.sin(TAU * s), 0.5 * R * Math.sin(2 * TAU * s));
}

export function reach(r: LimbRole, size: number): Path {
  const f = workFrame(r);
  return (s) => at(f, size * 0.25 * f.reach * (0.5 - 0.5 * Math.cos(TAU * s)), 0, size * 0.1 * f.reach * Math.sin(TAU * s));
}
