/**
 * Dynamic balance on a linear inverted pendulum, c'' = (g / z)(c - p): the zero-moment point p stays under the feet
 * that stand while the centre of mass c swings only as far as the pendulum carries it, not all the way over them.
 */
import type { P2 } from '../../math/planar/hull';
import type { MassPoint } from './mass';

/** A periodic signal rebuilt with each harmonic k scaled by gain(k). */
function filtered(values: number[], gain: (k: number) => number): number[] {
  const n = values.length, out = new Array<number>(n).fill(values.reduce((a, b) => a + b, 0) / n);
  for (let k = 1; k <= n / 2; k++) {
    const g = gain(k);
    if (!g) continue;
    let a = 0, b = 0;
    values.forEach((v, i) => {
      a += v * Math.cos((2 * Math.PI * k * i) / n);
      b += v * Math.sin((2 * Math.PI * k * i) / n);
    });
    const scale = (g * (2 * k === n ? 1 : 2)) / n;
    for (let i = 0; i < n; i++) out[i] += scale * (a * Math.cos((2 * Math.PI * k * i) / n) + b * Math.sin((2 * Math.PI * k * i) / n));
  }
  return out;
}

/** The periodic pendulum solution for a ZMP path: each harmonic of p, scaled by w2 / (w2 + (2πk/T)²). */
export const pendulumPath = (zmp: number[], period: number, w2: number) => filtered(zmp, (k) => w2 / (w2 + ((2 * Math.PI * k) / period) ** 2));

/** Only the slowest `keep` harmonics of a periodic signal. */
export const smoothPath = (values: number[], keep: number) => filtered(values, (k) => (k <= keep ? 1 : 0));

/** The pendulum between fixed ends, for a path that is not a loop: its unstable mode dies away from both, so a long enough tail lands on the loop. */
export function pendulumLine(zmp: number[], dt: number, w2: number, start: number, end: number): number[] {
  const n = zmp.length, k = w2 * dt * dt, diag = -(2 + k);
  const up = new Array<number>(n).fill(0), rhs = new Array<number>(n).fill(0);
  zmp.forEach((p, i) => {
    let r = -k * p;
    if (i === 0) r -= start;
    if (i === n - 1) r -= end;
    const m = diag - (i ? up[i - 1] : 0);
    up[i] = 1 / m;
    rhs[i] = (r - (i ? rhs[i - 1] : 0)) / m;
  });
  const out = [...rhs];
  for (let i = n - 2; i >= 0; i--) out[i] -= up[i] * out[i + 1];
  return out;
}

/** ZMP of point masses at evenly spaced samples of a loop (spin of each link about itself left out). */
export function zmpOf(samples: MassPoint[][], dt: number, gravity: number, floor: number): P2[] {
  const n = samples.length;
  return samples.map((now, k) => {
    const before = samples[(k + n - 1) % n], after = samples[(k + 1) % n];
    let x = 0, y = 0, down = 0;
    now.forEach(({ m, p }, i) => {
      const a = [0, 1, 2].map((d) => (after[i].p[d] - 2 * p[d] + before[i].p[d]) / (dt * dt));
      const w = m * (gravity + a[2]), h = p[2] - floor;
      x += w * p[0] - m * h * a[0];
      y += w * p[1] - m * h * a[1];
      down += w;
    });
    return [x / down, y / down];
  });
}
