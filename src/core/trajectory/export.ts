/** The sampled trajectory as data: `analyze()`'s t, q, qd, qdd plus the tool path, for CSV or JSON. */
import type { Vec3 } from '../math/linear/vec';
import { type Pace, type StopOpts, samplePlan } from './plan';
import { sampleQuintic } from './quintic/sample';

export interface TrajectoryInput {
  robot: string;
  joints: string[];
  limits: [number, number][];
  waypoints: number[][];
  duration: number;
  timestep: number;
  /** Vias and holds per stop, and pacing; without them the samples are exactly `analyze()`'s. */
  opts?: StopOpts[];
  pace?: Pace;
  /** Tool point of one limb for a whole-robot q. */
  tool?: { limb: string; at: (q: number[]) => Vec3 };
}

export interface TrajectoryRecord {
  robot: string;
  units: 'SI';
  joints: string[];
  /** Limb whose tool point `tool` follows. */
  limb: string | null;
  duration: number;
  /** Actual sample spacing: duration / ceil(duration / timestep). */
  dt: number;
  waypoints: number[][];
  t: number[];
  q: number[][];
  qd: number[][];
  qdd: number[][];
  tool: Vec3[] | null;
}

export function trajectoryRecord(input: TrajectoryInput): TrajectoryRecord {
  const plain = input.pace !== 'distance' && !input.opts?.some((o) => o.via || (o.hold ?? 0) > 0);
  const m = plain
    ? sampleQuintic(input.waypoints, input.duration, input.timestep, input.limits)
    : samplePlan({ waypoints: input.waypoints, duration: input.duration, opts: input.opts, pace: input.pace }, input.timestep, input.limits);
  return {
    robot: input.robot,
    units: 'SI',
    joints: [...input.joints],
    limb: input.tool?.limb ?? null,
    duration: input.duration,
    dt: m.dt,
    waypoints: input.waypoints.map((w) => [...w]),
    t: m.t,
    q: m.q,
    qd: m.qd,
    qdd: m.qdd,
    tool: input.tool ? m.q.map((q) => input.tool!.at(q)) : null,
  };
}

/** Joint names made unique and non-empty, so every CSV column can be addressed by name. */
export function columnNames(joints: string[]): string[] {
  const base = joints.map((n, k) => n.trim() || `j${k + 1}`);
  return base.map((n, k) => (base.indexOf(n) !== k || base.lastIndexOf(n) !== k ? `${n}_${k + 1}` : n));
}

const field = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function trajectoryCsv(r: TrajectoryRecord): string {
  const names = columnNames(r.joints);
  const head = ['t', ...['q', 'qd', 'qdd'].flatMap((p) => names.map((n) => `${p}_${n}`)), ...(r.tool ? ['tool_x', 'tool_y', 'tool_z'] : [])];
  const rows = r.t.map((t, i) => [t, ...r.q[i], ...r.qd[i], ...r.qdd[i], ...(r.tool?.[i] ?? [])].join(','));
  return `${[head.map(field).join(','), ...rows].join('\n')}\n`;
}

export const trajectoryJson = (r: TrajectoryRecord): string => `${JSON.stringify(r)}\n`;
