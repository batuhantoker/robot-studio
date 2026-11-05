/**
 * The swing-up: iterative LQR from hanging to upright inside the motors' limits, seeded by pumping energy in so
 * one motor alone has somewhere to start from. A step at a time, so the page keeps drawing while it thinks.
 */
import { type Mat, WEIGHTS, inverse, mul, tr } from './lqr';
import { type Motors, type Rig, UPRIGHT, type X, advance, mechanicalEnergy, torqueOf } from './model';

export interface SwingPlan {
  /** Seconds per step, and the state, feedforward and feedback gain at each. */
  h: number;
  x: X[];
  u: number[][];
  K: number[][][];
  /** How far the plan ends from upright. */
  miss: number;
}

const H = 0.01;
const FD = 1e-5;
const STATE = [1, 1, 0.05, 0.05];
const END = [30000, 30000, 3000, 3000];
const EFFORT = 0.02;
const ROUNDS = 300;
const STEPS = [1, 0.6, 0.35, 0.2, 0.1, 0.05, 0.02];
/** Seconds of full torque that start it moving, then the gain of the energy pump (N·m per J·rad/s). */
const KICK = 0.25;
const PUMP = 30;

/** Dearer than the regulator's: one weak joint chatters on its limit under gains that suit two. */
const TRACK_EFFORT = 5;
/** Share of the motors' limit the plan may use: the rest is what feedback has to correct with. */
const RESERVE = 0.85;

const clip = (v: number, limit: number) => Math.min(Math.max(v, -limit), limit);

/** A small system M y = b, several right-hand sides at once. */
function solve(a: number[][], b: number[][]): number[][] {
  const n = a.length, m = a.map((r, i) => [...r, ...b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
    [m[i], m[p]] = [m[p], m[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = m[r][i] / m[i][i];
      for (let c = i; c < m[i].length; c++) m[r][c] -= f * m[i][c];
    }
  }
  return m.map((r, i) => r.slice(n).map((v) => v / r[i]));
}

function seed(rig: Rig, motors: Motors, n: number, f: (x: X, u: number[]) => X, from: X): number[][] {
  const top = mechanicalEnergy(rig, UPRIGHT), out: number[][] = [];
  let x = from;
  for (let k = 0; k < n; k++) {
    const short = top - mechanicalEnergy(rig, x);
    const u = motors.map((j) => (k * H < KICK ? RESERVE * rig.limit : clip(PUMP * short * x[2 + j], RESERVE * rig.limit)));
    out.push(u);
    x = f(x, u);
  }
  return out;
}

/**
 * Feedback along the finished plan. Not the optimiser's own gains: those are zero wherever a motor sits on its limit,
 * which is most of a swing-up, and tracking would run open-loop there. Ends on the regulator's cost, so handing over is smooth.
 */
function tracker(f: (x: X, u: number[]) => X, xs: X[], us: number[][], end: Mat): number[][][] {
  const n = us.length, m = us[0].length, Q = WEIGHTS.map((v, i) => WEIGHTS.map((_, j) => (i === j ? v : 0)));
  const K: number[][][] = new Array(n);
  let S = end;
  for (let k = n - 1; k >= 0; k--) {
    const A: Mat = [[], [], [], []], B: Mat = [[], [], [], []];
    for (let i = 0; i < 4; i++) {
      const up = [...xs[k]] as X, down = [...xs[k]] as X;
      up[i] += FD;
      down[i] -= FD;
      const a = f(up, us[k]), b = f(down, us[k]);
      for (let r = 0; r < 4; r++) A[r][i] = (a[r] - b[r]) / (2 * FD);
    }
    for (let i = 0; i < m; i++) {
      const up = [...us[k]], down = [...us[k]];
      up[i] += FD;
      down[i] -= FD;
      const a = f(xs[k], up), b = f(xs[k], down);
      for (let r = 0; r < 4; r++) B[r][i] = (a[r] - b[r]) / (2 * FD);
    }
    const BS = mul(tr(B), S), gain = mul(inverse(mul(BS, B).map((r, i) => r.map((v, j) => v + (i === j ? TRACK_EFFORT : 0)))), mul(BS, A));
    K[k] = gain.map((r) => r.map((v) => -v));
    const AS = mul(tr(A), S), kept = mul(mul(AS, B), gain);
    S = mul(AS, A).map((r, i) => r.map((v, j) => 0.5 * (v - kept[i][j] + mul(AS, A)[j][i] - kept[j][i]) + Q[i][j]));
  }
  return K;
}

export function* swingUp(rig: Rig, motors: Motors, seconds: number, end: Mat, from: X = [0, 0, 0, 0]): Generator<void, SwingPlan> {
  const n = Math.round(seconds / H), m = motors.length, limit = RESERVE * rig.limit;
  const f = (x: X, u: number[]) => advance(rig, x, torqueOf(motors, u), H);
  const off = (x: X) => x.map((v, i) => v - UPRIGHT[i]);
  const stage = (x: X, u: number[]) => 0.5 * H * (off(x).reduce((s, v, i) => s + STATE[i] * v * v, 0) + u.reduce((s, v) => s + EFFORT * v * v, 0));
  const last = (x: X) => 0.5 * off(x).reduce((s, v, i) => s + END[i] * v * v, 0);
  let U = seed(rig, motors, n, f, from), Xs: X[] = [from], J = 0;
  for (let k = 0; k < n; k++) {
    J += stage(Xs[k], U[k]);
    Xs.push(f(Xs[k], U[k]));
  }
  J += last(Xs[n]);
  let mu = 1e-3, K: number[][][] = [], d: number[][] = [];
  const idx = [0, 1, 2, 3], ctl = Array.from({ length: m }, (_, i) => i);
  for (let round = 0; round < ROUNDS; round++) {
    // A[k][i] is the step's change for a nudge of state i; B[k][i] for one of control i.
    const A: number[][][] = [], B: number[][][] = [];
    for (let k = 0; k < n; k++) {
      A.push(idx.map((i) => {
        const up = [...Xs[k]] as X, down = [...Xs[k]] as X;
        up[i] += FD;
        down[i] -= FD;
        const a = f(up, U[k]), b = f(down, U[k]);
        return a.map((v, r) => (v - b[r]) / (2 * FD));
      }));
      B.push(ctl.map((i) => {
        const up = [...U[k]], down = [...U[k]];
        up[i] += FD;
        down[i] -= FD;
        const a = f(Xs[k], up), b = f(Xs[k], down);
        return a.map((v, r) => (v - b[r]) / (2 * FD));
      }));
    }
    let improved = false, done = false;
    for (let tries = 0; tries < 12 && !improved; tries++) {
      let Vx = off(Xs[n]).map((v, i) => END[i] * v);
      let Vxx = idx.map((i) => idx.map((j) => (i === j ? END[i] : 0)));
      K = new Array(n);
      d = new Array(n);
      let bad = false;
      for (let k = n - 1; k >= 0; k--) {
        const a = A[k], b = B[k];
        const quad = (p: number[], q: number[]) => { let s = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s += p[r] * Vxx[r][c] * q[c]; return s; };
        const lin = (p: number[]) => p.reduce((s, v, r) => s + v * Vx[r], 0);
        const Qx = off(Xs[k]).map((v, i) => v * STATE[i] * H + lin(a[i]));
        const Qu = U[k].map((v, i) => v * EFFORT * H + lin(b[i]));
        const Qxx = idx.map((i) => idx.map((j) => quad(a[i], a[j]) + (i === j ? STATE[i] * H : 0)));
        const Qux = ctl.map((i) => idx.map((j) => quad(b[i], a[j])));
        const Quu = ctl.map((i) => ctl.map((j) => quad(b[i], b[j]) + (i === j ? EFFORT * H + mu : 0)));
        if (Quu[0][0] <= 0 || (m === 2 && (Quu[1][1] <= 0 || Quu[0][0] * Quu[1][1] - Quu[0][1] ** 2 <= 0))) {
          bad = true;
          break;
        }
        // A control held on its limit takes no feedback.
        const free = ctl.filter((i) => {
          const v = -Qu[i] / Quu[i][i];
          return !((U[k][i] >= limit - 1e-9 && v > 0) || (U[k][i] <= -limit + 1e-9 && v < 0));
        });
        const dk = ctl.map(() => 0), Kk = ctl.map(() => [0, 0, 0, 0]);
        if (free.length) {
          const s = solve(free.map((i) => free.map((j) => Quu[i][j])), free.map((i) => [-Qu[i], ...Qux[i].map((v) => -v)]));
          free.forEach((i, r) => {
            dk[i] = s[r][0];
            Kk[i] = s[r].slice(1);
          });
        }
        K[k] = Kk;
        d[k] = dk;
        Vx = Qx.map((v, i) => ctl.reduce((s, u) => s + Kk[u][i] * Qu[u] + Qux[u][i] * dk[u] + ctl.reduce((t, w) => t + Kk[u][i] * Quu[u][w] * dk[w], 0), v));
        const full = Qxx.map((r, i) => r.map((v, j) => ctl.reduce((s, u) => s + Kk[u][i] * Qux[u][j] + Qux[u][i] * Kk[u][j] + ctl.reduce((t, w) => t + Kk[u][i] * Quu[u][w] * Kk[w][j], 0), v)));
        Vxx = full.map((r, i) => r.map((v, j) => 0.5 * (v + full[j][i])));
      }
      if (bad) {
        mu = Math.min(mu * 4, 1e6);
        continue;
      }
      for (const step of STEPS) {
        const X2: X[] = [from], U2: number[][] = [];
        let J2 = 0;
        for (let k = 0; k < n; k++) {
          const dx = X2[k].map((v, i) => v - Xs[k][i]);
          const u = U[k].map((v, i) => clip(v + step * d[k][i] + K[k][i].reduce((s, g, c) => s + g * dx[c], 0), limit));
          U2.push(u);
          J2 += stage(X2[k], u);
          X2.push(f(X2[k], u));
        }
        J2 += last(X2[n]);
        if (Number.isFinite(J2) && J2 < J) {
          done = (J - J2) / J < 1e-6;
          Xs = X2;
          U = U2;
          J = J2;
          improved = true;
          mu = Math.max(mu / 2, 1e-6);
          break;
        }
      }
      if (!improved) mu = Math.min(mu * 4, 1e6);
    }
    if (!improved || done) break;
    yield;
  }
  return { h: H, x: Xs, u: U, K: tracker(f, Xs, U, end), miss: Math.hypot(...off(Xs[n])) };
}
