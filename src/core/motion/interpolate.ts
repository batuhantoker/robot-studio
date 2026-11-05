/** Catmull–Rom through evenly spaced samples: seamless around a loop, and across a lead-in into one. */
const catmull = (p0: number[], p1: number[], p2: number[], p3: number[], f: number) => {
  const f2 = f * f, f3 = f2 * f;
  return p1.map((_, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * f3));
};

export function periodicSpline(samples: number[][], period: number) {
  const n = samples.length;
  return (t: number): number[] => {
    const u = ((((t / period) % 1) + 1) % 1) * n;
    const i = Math.floor(u), f = u - i;
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((d) => samples[(((i + d) % n) + n) % n]);
    return catmull(p0, p1, p2, p3, f);
  };
}

/** Second derivatives of the cubic through evenly spaced samples, by relaxation; `ends` pins them at the two ends, or null wraps round. */
function curvatures(y: number[][], h: number, ends: [number[], number[]] | null): number[][] {
  const n = y.length, w = y[0].length;
  const at = (i: number) => (i + n) % n;
  const m = y.map(() => new Array<number>(w).fill(0));
  if (ends) [m[0], m[n - 1]] = [[...ends[0]], [...ends[1]]];
  for (let sweep = 0; sweep < 24; sweep++) {
    for (let i = ends ? 1 : 0; i < (ends ? n - 1 : n); i++) {
      const a = at(i - 1), b = at(i + 1);
      for (let k = 0; k < w; k++) m[i][k] = (6 * (y[a][k] - 2 * y[i][k] + y[b][k]) / (h * h) - m[a][k] - m[b][k]) / 4;
    }
  }
  return m;
}

const cubic = (a: number[], b: number[], ma: number[], mb: number[], h: number, f: number) => {
  const g = 1 - f;
  return a.map((v, k) => g * v + f * b[k] + (h * h / 6) * ((g * g * g - g) * ma[k] + (f * f * f - f) * mb[k]));
};

/**
 * `head` plays once at the loop's sample rate, then `samples` repeat from t = head.length · period / samples.length.
 * Cubic with continuous acceleration, so what is derived from it, a zero-moment point, does not saw between samples.
 */
export function leadSpline(head: number[][], samples: number[][], period: number) {
  const n = samples.length, h = period / n, lead = head.length * h;
  const ring = curvatures(samples, h, null);
  const line = [...head, samples[0]];
  const bent = curvatures(line, h, [head[0].map(() => 0), ring[0]]);
  return (t: number): number[] => {
    if (t >= lead) {
      const u = ((((t - lead) / period) % 1) + 1) % 1 * n, i = Math.min(Math.floor(u), n - 1), j = (i + 1) % n;
      return cubic(samples[i], samples[j], ring[i], ring[j], h, u - i);
    }
    // Just short of the lead, rounding can land u on the end of the line.
    const u = Math.max(t, 0) / h, i = Math.min(Math.floor(u), line.length - 2);
    return cubic(line[i], line[i + 1], bent[i], bent[i + 1], h, u - i);
  };
}
