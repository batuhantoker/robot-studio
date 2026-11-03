import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/linear/vec';
import { columnNames, trajectoryCsv, trajectoryJson, trajectoryRecord } from '@/core/trajectory/export';
import { sampleQuintic } from '@/core/trajectory/quintic/sample';

const limits: [number, number][] = [[-1, 1], [-2, 2], [-0.5, 0.5]];
const waypoints = [[0, 0, 0], [0.4, -0.3, 0.2], [-0.2, 0.5, -0.1], [0.1, 0.1, 0.1]];
// Text formats write -0 as 0.
const unsign = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const input = {
  robot: 'arm',
  joints: ['shoulder', 'elbow', 'wrist'],
  limits,
  waypoints,
  duration: 3,
  timestep: 0.01,
  tool: { limb: 'arm', at: (q: number[]): Vec3 => [q[0], 2 * q[1], q[0] + q[2]] },
};

describe('trajectory export', () => {
  const r = trajectoryRecord(input);

  it('samples exactly like sampleQuintic', () => {
    const m = sampleQuintic(waypoints, 3, 0.01, limits);
    expect(r.t).toEqual(m.t);
    expect(r.q).toEqual(m.q);
    expect(r.qd).toEqual(m.qd);
    expect(r.qdd).toEqual(m.qdd);
    expect(r.dt).toBe(m.dt);
    expect(r.t.length).toBe(Math.ceil(3 / 0.01) + 1);
  });

  it('starts and ends at rest on the end waypoints', () => {
    expect(r.q[0]).toEqual(waypoints[0]);
    expect(r.q.at(-1)).toEqual(waypoints.at(-1));
    for (const i of [0, r.t.length - 1]) {
      expect(r.qd[i].every((v) => v === 0)).toBe(true);
      expect(r.qdd[i].every((v) => v === 0)).toBe(true);
    }
  });

  it('follows the tool through every sample', () => {
    expect(r.limb).toBe('arm');
    expect(r.tool).toEqual(r.q.map((q) => input.tool.at(q)));
  });

  it('writes a CSV that parses back to the same numbers', () => {
    const [head, ...rows] = trajectoryCsv(r).trimEnd().split('\n');
    expect(head.split(',')).toEqual([
      't', 'q_shoulder', 'q_elbow', 'q_wrist', 'qd_shoulder', 'qd_elbow', 'qd_wrist',
      'qdd_shoulder', 'qdd_elbow', 'qdd_wrist', 'tool_x', 'tool_y', 'tool_z',
    ]);
    expect(rows.length).toBe(r.t.length);
    rows.forEach((row, i) => expect(row.split(',').map(Number)).toEqual(unsign([r.t[i], ...r.q[i], ...r.qd[i], ...r.qdd[i], ...r.tool![i]])));
  });

  it('omits tool columns without a tool', () => {
    const bare = trajectoryRecord({ ...input, tool: undefined });
    expect(bare.tool).toBeNull();
    expect(trajectoryCsv(bare).split('\n')[0].split(',')).toHaveLength(10);
  });

  it('round-trips through JSON with the analyze() keys', () => {
    const back = JSON.parse(trajectoryJson(r));
    expect(back).toEqual(unsign(r));
    for (const key of ['t', 'q', 'qd', 'qdd', 'waypoints', 'duration']) expect(back).toHaveProperty(key);
  });

  it('makes column names unique, non-empty and CSV-safe', () => {
    expect(columnNames(['hip', 'knee', 'hip', ' '])).toEqual(['hip_1', 'knee', 'hip_3', 'j4']);
    const odd = trajectoryRecord({ ...input, joints: ['a,b', 'say "hi"', 'c'], tool: undefined });
    expect(trajectoryCsv(odd).split('\n')[0]).toBe('t,"q_a,b","q_say ""hi""",q_c,"qd_a,b","qd_say ""hi""",qd_c,"qdd_a,b","qdd_say ""hi""",qdd_c');
  });

  it('surfaces the step limit', () => {
    expect(() => trajectoryRecord({ ...input, timestep: 1e-7 })).toThrow(/1,000,000/);
  });
});
