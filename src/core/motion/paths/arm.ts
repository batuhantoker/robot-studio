/** Tool paths for arms, drawn in each arm's outward-facing vertical plane. */
import type { Vec3 } from '../../math/linear/vec';
import type { LimbRole } from '../roles';
import { at, workFrame } from './frame';

type Path = (s: number) => Vec3;
const TAU = Math.PI * 2;
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(Math.max(x, 0), 1));

export function circle(r: LimbRole, size: number): Path {
  const f = workFrame(r), R = size * 0.16 * f.reach;
  return (s) => at(f, 0, R * Math.cos(TAU * s), R * Math.sin(TAU * s));
}

export function figureEight(r: LimbRole, size: number): Path {
  const f = workFrame(r), R = size * 0.2 * f.reach;
  return (s) => at(f, 0, R * Math.sin(TAU * s), 0.5 * R * Math.sin(2 * TAU * s));
}

/** Above A, down, up, across, down at B, up, back. */
export function pickAndPlace(r: LimbRole, size: number): Path {
  const f = workFrame(r), w = size * 0.18 * f.reach, d = size * 0.14 * f.reach;
  const keys: [number, number][] = [[-w, 0], [-w, -d], [-w, 0], [w, 0], [w, -d], [w, 0]];
  return (s) => {
    const u = s * keys.length, i = Math.floor(u);
    const [a, b] = [keys[i % keys.length], keys[(i + 1) % keys.length]];
    const k = ease(u - i);
    return at(f, 0, a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k);
  };
}

/** Raise the hand beside the head and sway it. */
export function wave(r: LimbRole, size: number): Path {
  const f = { ...workFrame(r), origin: r.base };
  return (s) => at(f, 0.25 * r.length, (r.left ? 1 : -1) * 0.15 * r.length + size * 0.12 * r.length * Math.sin(2 * TAU * s), 0.7 * r.length);
}

export function reach(r: LimbRole, size: number): Path {
  const f = workFrame(r);
  return (s) => at(f, size * 0.25 * f.reach * (0.5 - 0.5 * Math.cos(TAU * s)), 0, size * 0.1 * f.reach * Math.sin(TAU * s));
}
