/** Foot paths for stepping in place: swing (lift and carry) then stance (slide back on the ground). */
import { type Vec3, add } from '../../math/linear/vec';
import type { LimbRole } from '../roles';

const TAU = Math.PI * 2;

export function footPath(r: LimbRole, phase: number, size: number, stride = 1): (s: number) => Vec3 {
  const L = size * 0.22 * r.length * stride, H = size * 0.14 * r.length;
  return (s) => {
    const u = (((s + phase) % 1) + 1) % 1;
    const swing = u < 0.5;
    const v = swing ? u / 0.5 : (u - 0.5) / 0.5;
    const k = 0.5 - 0.5 * Math.cos(Math.PI * v);
    const x = swing ? L * (-0.5 + k) : L * (0.5 - k);
    return add(r.tip, [x, 0, swing ? H * Math.sin(Math.PI * v) : 0]);
  };
}

/** Diagonal pairs together (trot), a four-beat lateral sequence (walk), or alternating tripods. */
export function gaitPhases(legs: LimbRole[], gait: 'trot' | 'walk' | 'tripod' | 'march'): number[] {
  if (gait === 'march' || legs.length === 2) return legs.map((l) => (l.left ? 0 : 0.5));
  if (gait === 'trot') return legs.map((l) => (l.front === l.left ? 0 : 0.5));
  if (gait === 'walk') return legs.map((l) => (l.left ? 0 : 0.5) + (l.front ? 0.25 : 0));
  const order = [...legs].sort((a, b) => Math.atan2(a.tip[1], a.tip[0]) - Math.atan2(b.tip[1], b.tip[0]));
  return legs.map((l) => (order.indexOf(l) % 2) * 0.5);
}

/** Feet pulled up together, so the legs fold as in a squat (the base stays fixed). */
export function bob(r: LimbRole, size: number): (s: number) => Vec3 {
  const H = size * 0.18 * r.length;
  return (s) => add(r.tip, [0, 0, H * (0.5 - 0.5 * Math.cos(TAU * s))]);
}
