/** A cycle as smooth stop-to-stop segments; each runs through its joint-space via points without stopping. */
import { blend } from '../../trajectory/quintic/profile';

export interface Segment {
  /** Joint-space via points, first to last; one point holds still (a dwell). */
  qs: number[][];
  /** Gripper opening at the start and end of the segment. */
  gap: [number, number];
  duration: number;
}

const step = (a: number[], b: number[]) => Math.max(0, ...a.map((v, i) => Math.abs(b[i] - v)));

/** Peak speed of a quintic stop-to-stop move is 1.875× its average; keep it near `speed` rad/s. */
export function moveTime(qs: number[][], speed = 0.9, minimum = 0.35): number {
  const span = qs.slice(1).reduce((s, q, i) => s + step(qs[i], q), 0);
  return Math.max(minimum, (1.875 * span) / speed);
}

function along(qs: number[][], s: number): number[] {
  if (qs.length === 1) return [...qs[0]];
  const lengths = qs.slice(1).map((q, i) => step(qs[i], q) + 1e-12);
  let left = s * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const u = Math.min(left / lengths[i], 1);
      return qs[i].map((v, k) => v + (qs[i + 1][k] - v) * u);
    }
    left -= lengths[i];
  }
  return [...qs[qs.length - 1]];
}

export function timeline(segments: Segment[]) {
  const starts: number[] = [];
  const period = segments.reduce((t, seg) => (starts.push(t), t + seg.duration), 0);
  const find = (t: number) => {
    const x = ((t % period) + period) % period;
    let i = starts.length - 1;
    while (i > 0 && starts[i] > x) i--;
    return { seg: segments[i], u: Math.min((x - starts[i]) / segments[i].duration, 1) };
  };
  return {
    period,
    starts,
    at(t: number) {
      const { seg, u } = find(t);
      const s = blend(u).s;
      return { q: along(seg.qs, s), gap: seg.gap[0] + (seg.gap[1] - seg.gap[0]) * s };
    },
  };
}
