/**
 * Kociemba's two-phase algorithm, the solver OpenAI's Dactyl took its face turns from. Phase 1 brings the cube
 * into <U, D, R2, L2, F2, B2> (corners and edges oriented, the middle-slice edges in the slice); phase 2 solves it
 * with those moves only. Both phases are IDA* searches over coordinates with BFS-filled pruning tables.
 */
import { BASIC, type CubieCube, type Move, applyMove, multiply, solvedCube } from './cube';

const N_TWIST = 2187;
const N_FLIP = 2048;
const N_SLICE = 495;
const N_PERM8 = 40320;
const N_PERM4 = 24;
/** Phase-2 moves as indices 3·face + turns − 1: U U2 U' D D2 D' R2 F2 L2 B2. */
const P2 = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16];
const IN_P2 = new Set(P2);

const C = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
};

function rank(p: ArrayLike<number>, n: number): number {
  let r = 0;
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) c++;
    r = r * (n - i) + c;
  }
  return r;
}

function unrank(r: number, n: number): number[] {
  const c = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    c[i] = r % (n - i);
    r = Math.floor(r / (n - i));
  }
  const pool = Array.from({ length: n }, (_, i) => i);
  return c.map((k) => pool.splice(k, 1)[0]);
}

export const twistOf = (c: CubieCube) => c.co.slice(0, 7).reduce((t, o) => 3 * t + o, 0);
export const flipOf = (c: CubieCube) => c.eo.slice(0, 11).reduce((t, o) => 2 * t + o, 0);

/** Which four slots hold the FR FL BL BR edges, in the combinatorial number system (0 when they are home). */
export function sliceOf(c: CubieCube): number {
  let a = 0;
  let x = 0;
  for (let j = 11; j >= 0; j--) if (c.ep[j] >= 8) a += C(11 - j, ++x);
  return a;
}

const cornerPermOf = (c: CubieCube) => rank(c.cp, 8);
const edgePermOf = (c: CubieCube) => rank(c.ep, 8);
const slicePermOf = (c: CubieCube) => rank(c.ep.slice(8).map((e) => e - 8), 4);

function withTwist(t: number): CubieCube {
  const c = solvedCube();
  let s = 0;
  for (let i = 6; i >= 0; i--) {
    c.co[i] = t % 3;
    s += c.co[i];
    t = Math.floor(t / 3);
  }
  c.co[7] = (3 - (s % 3)) % 3;
  return c;
}

function withFlip(f: number): CubieCube {
  const c = solvedCube();
  let s = 0;
  for (let i = 10; i >= 0; i--) {
    c.eo[i] = f % 2;
    s += c.eo[i];
    f = Math.floor(f / 2);
  }
  c.eo[11] = s % 2;
  return c;
}

function withSlice(a: number): CubieCube {
  const c = solvedCube();
  const slots: number[] = [];
  for (let k = 4; k >= 1; k--) {
    let v = k - 1;
    while (C(v + 1, k) <= a) v++;
    a -= C(v, k);
    slots.push(11 - v);
  }
  c.ep.fill(-1);
  slots.forEach((j, i) => (c.ep[j] = 8 + i));
  let other = 0;
  for (let j = 0; j < 12; j++) if (c.ep[j] < 0) c.ep[j] = other++;
  return c;
}

function withCornerPerm(r: number): CubieCube {
  const c = solvedCube();
  c.cp = unrank(r, 8);
  return c;
}

function withEdgePerm(r: number): CubieCube {
  const c = solvedCube();
  c.ep = [...unrank(r, 8), 8, 9, 10, 11];
  return c;
}

function withSlicePerm(r: number): CubieCube {
  const c = solvedCube();
  c.ep = [0, 1, 2, 3, 4, 5, 6, 7, ...unrank(r, 4).map((e) => e + 8)];
  return c;
}

/** coordinate × move → coordinate, for the moves listed (as indices 3·face + turns − 1). */
function moveTable(n: number, moves: number[], make: (i: number) => CubieCube, read: (c: CubieCube) => number): Uint16Array {
  const t = new Uint16Array(n * moves.length);
  for (let i = 0; i < n; i++) {
    const c = make(i);
    moves.forEach((m, k) => {
      let d = c;
      for (let q = 0; q <= m % 3; q++) d = multiply(d, BASIC[Math.floor(m / 3)]);
      t[i * moves.length + k] = read(d);
    });
  }
  return t;
}

/** Fewest moves to bring (a, b) home, filled breadth-first. */
function pruneTable(na: number, nb: number, ma: Uint16Array, mb: Uint16Array, nMoves: number): Int8Array {
  const t = new Int8Array(na * nb).fill(-1);
  t[0] = 0;
  let filled = 1;
  for (let depth = 0; filled < t.length; depth++) {
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== depth) continue;
      const a = Math.floor(i / nb), b = i - a * nb;
      for (let m = 0; m < nMoves; m++) {
        const j = ma[a * nMoves + m] * nb + mb[b * nMoves + m];
        if (t[j] < 0) {
          t[j] = depth + 1;
          filled++;
        }
      }
    }
  }
  return t;
}

export interface Tables {
  twist: Uint16Array;
  flip: Uint16Array;
  slice: Uint16Array;
  corner2: Uint16Array;
  edge2: Uint16Array;
  slicePerm2: Uint16Array;
  twistSlice: Int8Array;
  flipSlice: Int8Array;
  cornerSlice: Int8Array;
  edgeSlice: Int8Array;
}

let cached: Tables | null = null;

/** About half a second the first time; the solver worker builds them off the main thread. */
export function tables(): Tables {
  if (cached) return cached;
  const all = Array.from({ length: 18 }, (_, i) => i);
  const twist = moveTable(N_TWIST, all, withTwist, twistOf);
  const flip = moveTable(N_FLIP, all, withFlip, flipOf);
  const slice = moveTable(N_SLICE, all, withSlice, sliceOf);
  const corner2 = moveTable(N_PERM8, P2, withCornerPerm, cornerPermOf);
  const edge2 = moveTable(N_PERM8, P2, withEdgePerm, edgePermOf);
  const slicePerm2 = moveTable(N_PERM4, P2, withSlicePerm, slicePermOf);
  return (cached = {
    twist, flip, slice, corner2, edge2, slicePerm2,
    twistSlice: pruneTable(N_TWIST, N_SLICE, twist, slice, 18),
    flipSlice: pruneTable(N_FLIP, N_SLICE, flip, slice, 18),
    cornerSlice: pruneTable(N_PERM8, N_PERM4, corner2, slicePerm2, P2.length),
    edgeSlice: pruneTable(N_PERM8, N_PERM4, edge2, slicePerm2, P2.length),
  });
}

export interface SolveOptions {
  /** Stop at the first solution this short or shorter. */
  target?: number;
  /** After this long, settle for the best solution found so far. */
  budgetMs?: number;
}

const toMove = (m: number): Move => ({ face: Math.floor(m / 3), turns: ((m % 3) + 1) as Move['turns'] });

/** Face turns that solve `cube`; Kociemba's first solutions are usually 20 to 23 moves, refined towards `target`. */
export function solve(cube: CubieCube, opts: SolveOptions = {}): Move[] {
  const T = tables();
  const target = opts.target ?? 20;
  const deadline = Date.now() + (opts.budgetMs ?? 400);
  const path1 = new Int8Array(32);
  const path2 = new Int8Array(32);
  let best: number[] | null = null;
  let bestLen = 31;
  const done = () => !!best && (bestLen <= target || Date.now() > deadline);

  const search2 = (c: number, e: number, s: number, n: number, togo: number, last: number): boolean => {
    if (togo === 0) return c === 0 && e === 0 && s === 0;
    for (let k = 0; k < P2.length; k++) {
      const f = Math.floor(P2[k] / 3);
      if (f === last || f === last - 3) continue;
      const c2 = T.corner2[c * 10 + k], e2 = T.edge2[e * 10 + k], s2 = T.slicePerm2[s * 10 + k];
      if (Math.max(T.cornerSlice[c2 * 24 + s2], T.edgeSlice[e2 * 24 + s2]) >= togo) continue;
      path2[n] = P2[k];
      if (search2(c2, e2, s2, n + 1, togo - 1, f)) return true;
    }
    return false;
  };

  const phase2 = (n1: number) => {
    let c = cube;
    for (let i = 0; i < n1; i++) c = applyMove(c, toMove(path1[i]));
    const cp = cornerPermOf(c), ep = edgePermOf(c), sp = slicePermOf(c);
    // Phase 2 rarely needs more than 11 moves; a deeper phase 1 finds those cubes sooner than a deep phase 2 does.
    const most = Math.min(bestLen - 1 - n1, 11);
    const h = Math.max(T.cornerSlice[cp * 24 + sp], T.edgeSlice[ep * 24 + sp]);
    const last = n1 ? Math.floor(path1[n1 - 1] / 3) : -1;
    for (let d = h; d <= most; d++) {
      if (!search2(cp, ep, sp, 0, d, last)) continue;
      best = [...path1.slice(0, n1), ...path2.slice(0, d)];
      bestLen = n1 + d;
      return;
    }
  };

  const search1 = (t: number, f: number, s: number, n: number, togo: number, last: number): void => {
    if (togo === 0) {
      // Ending on a phase-2 move means a shorter phase 1 reached the same cube, and was tried already.
      if (t === 0 && f === 0 && s === 0 && (n === 0 || !IN_P2.has(path1[n - 1]))) phase2(n);
      return;
    }
    for (let m = 0; m < 18; m++) {
      const face = Math.floor(m / 3);
      if (face === last || face === last - 3) continue;
      const t2 = T.twist[t * 18 + m], f2 = T.flip[f * 18 + m], s2 = T.slice[s * 18 + m];
      if (Math.max(T.twistSlice[t2 * N_SLICE + s2], T.flipSlice[f2 * N_SLICE + s2]) >= togo) continue;
      path1[n] = m;
      search1(t2, f2, s2, n + 1, togo - 1, face);
      if (done()) return;
    }
  };

  const t0 = twistOf(cube), f0 = flipOf(cube), s0 = sliceOf(cube);
  for (let d = Math.max(T.twistSlice[t0 * N_SLICE + s0], T.flipSlice[f0 * N_SLICE + s0]); d < bestLen; d++) {
    search1(t0, f0, s0, 0, d, -1);
    if (done()) break;
  }
  if (!best) throw new Error('no solution: the cube is not solvable');
  return (best as number[]).map(toMove);
}
