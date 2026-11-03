/** Field validators with SerialArm's error messages. */
import type { Vec3 } from '../../math/linear/vec';
import { SpecError } from './types';

export function number(value: unknown, name: string, opts: { positive?: boolean; minimum?: number } = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new SpecError(`${name} must be a finite number`);
  if (opts.positive && value <= 0) throw new SpecError(`${name} must be positive`);
  if (opts.minimum !== undefined && value < opts.minimum) throw new SpecError(`${name} must be at least ${opts.minimum}`);
  return value;
}

export function vector(value: unknown, size: number, name: string): number[] {
  if (!Array.isArray(value) || value.length !== size) throw new SpecError(`${name} must have shape (${size},)`);
  return value.map((item) => number(item, name));
}

export const triple = (value: unknown, name: string): Vec3 => vector(value, 3, name) as Vec3;

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Scale by the largest component before normalizing, exactly like Link.__post_init__. */
export function normalizeAxis(axis: Vec3, name: string): Vec3 {
  const s = Math.max(...axis.map(Math.abs));
  if (s === 0) throw new SpecError(`${name}.axis must be nonzero`);
  const scaled = axis.map((v) => v / s) as Vec3;
  const n = Math.sqrt(scaled[0] ** 2 + scaled[1] ** 2 + scaled[2] ** 2);
  return scaled.map((v) => v / n) as Vec3;
}
