/** Holding it upright: the linear-quadratic regulator of the rig linearised at the top. */
import { type Motors, type Rig, UPRIGHT, type X, advance, torqueOf } from './model';

export type Mat = number[][];

export const mul = (a: Mat, b: Mat): Mat => a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
export const tr = (a: Mat): Mat => a[0].map((_, j) => a.map((r) => r[j]));

export function inverse(m: Mat): Mat {
  const n = m.length, w = m.map((r, i) => [...r, ...r.map((_, j) => Number(i === j))]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(w[r][i]) > Math.abs(w[p][i])) p = r;
    [w[i], w[p]] = [w[p], w[i]];
    const d = w[i][i];
    w[i] = w[i].map((v) => v / d);
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = w[r][i];
      w[r] = w[r].map((v, c) => v - f * w[i][c]);
    }
  }
  return w.map((r) => r.slice(n));
}

/** Discrete step the gains are worked out at; far slower dynamics than this at the top. */
const H = 0.01;
const EPS = 1e-6;
export const WEIGHTS = [20, 20, 2, 2];
export const EFFORT = 0.5;

export interface Balance {
  /** u = -K e, one row per working motor. */
  K: Mat;
  /** Cost to go from e, for telling when the regulator can take over. */
  S: Mat;
}

export function balance(rig: Rig, motors: Motors): Balance {
  const n = motors.length, f = (x: X, u: number[]) => advance(rig, x, torqueOf(motors, u), H);
  const A: Mat = [[], [], [], []], B: Mat = [[], [], [], []];
  const none = new Array<number>(n).fill(0);
  for (let i = 0; i < 4; i++) {
    const up = [...UPRIGHT] as X, down = [...UPRIGHT] as X;
    up[i] += EPS;
    down[i] -= EPS;
    const a = f(up, none), b = f(down, none);
    for (let r = 0; r < 4; r++) A[r][i] = (a[r] - b[r]) / (2 * EPS);
  }
  for (let i = 0; i < n; i++) {
    const up = [...none], down = [...none];
    up[i] = EPS;
    down[i] = -EPS;
    const a = f(UPRIGHT, up), b = f(UPRIGHT, down);
    for (let r = 0; r < 4; r++) B[r][i] = (a[r] - b[r]) / (2 * EPS);
  }
  const Q = WEIGHTS.map((v, i) => WEIGHTS.map((_, j) => (i === j ? v : 0)));
  let S = Q, K: Mat = [];
  for (let it = 0; it < 20000; it++) {
    const At = tr(A), Bt = tr(B), BS = mul(Bt, S);
    K = mul(inverse(mul(BS, B).map((r, i) => r.map((v, j) => v + (i === j ? EFFORT : 0)))), mul(BS, A));
    const AS = mul(At, S), gain = mul(mul(AS, B), K), next = mul(AS, A).map((r, i) => r.map((v, j) => v + Q[i][j] - gain[i][j]));
    const moved = Math.max(...next.flatMap((r, i) => r.map((v, j) => Math.abs(v - S[i][j]))));
    S = next;
    if (moved < 1e-7) break;
  }
  return { K, S };
}

export const costToGo = ({ S }: Balance, e: X) => e.reduce((s, v, i) => s + v * S[i].reduce((a, w, j) => a + w * e[j], 0), 0);
