/** Periodic Catmull–Rom through evenly spaced samples of one cycle: smooth and seamless at the loop. */
export function periodicSpline(samples: number[][], period: number) {
  const n = samples.length;
  return (t: number): number[] => {
    const u = ((((t / period) % 1) + 1) % 1) * n;
    const i = Math.floor(u), f = u - i;
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((d) => samples[(((i + d) % n) + n) % n]);
    const f2 = f * f, f3 = f2 * f;
    return p1.map((_, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * f3));
  };
}
