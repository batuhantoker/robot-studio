import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRobot } from '@/core/robot/schema/parse';
import type { RobotSpec } from '@/core/robot/schema/types';

interface KinematicsCase {
  q: number[];
  position: number[];
  rotation: number[];
  points: number[][];
  jacobian: number[][];
}

interface PythonRobot {
  config: Record<string, unknown>;
  mjcf: string;
  mjcf_dt_0_01: string;
  kinematics: KinematicsCase[];
  ik: { target: number[]; q0: number[]; q: number[]; success: boolean; residual: number }[];
}

interface Motion {
  robot: string;
  timestep: number;
  duration: number;
  waypoints?: number[][];
  t: number[];
  q: number[][];
  qd: number[][];
  qdd: number[][];
}

export interface PythonFixture {
  robots: Record<string, PythonRobot>;
  validation: { name: string; config: unknown; ok: boolean; error?: string; normalized?: unknown }[];
  trajectory: { scenario: Motion; default: Motion };
  kane: { q: number[]; position_mm: number[] }[];
}

export const python: PythonFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/python.json', import.meta.url)), 'utf8'),
);

export const presetSpec = (name: string): RobotSpec => parseRobot(python.robots[name].config);
export const presetNames = Object.keys(python.robots);

export function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, tol: number) {
  if (actual.length !== expected.length) throw new Error(`length ${actual.length} != ${expected.length}`);
  for (let i = 0; i < actual.length; i++) {
    const diff = Math.abs(actual[i] - expected[i]);
    if (!(diff <= tol)) throw new Error(`index ${i}: ${actual[i]} vs ${expected[i]} (|Δ| ${diff} > ${tol})`);
  }
}
