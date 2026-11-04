/**
 * A solution as one palm-up hand performs it, the way Dactyl did: only the top face is ever turned, and the whole
 * cube is yawed on the palm or flipped towards the wrist to bring the next face up. Hand frame: e1 points to the
 * thumb side, e2 towards the fingertips, e3 up out of the palm.
 */
import type { Move } from './cube';
import { FACE_NORMALS, IDENTITY, type Mat3, apply, mul, rotation } from './pieces';

export type HandStep =
  | { kind: 'twist'; move: Move }
  /** Quarter turns of the whole cube about the palm normal, counter-clockwise seen from above. */
  | { kind: 'yaw'; quarters: 1 | -1 | 2 }
  /** Rolled about the thumb axis: `1` brings the far face up (the fingers lift it), `-1` the near face (the thumb does). */
  | { kind: 'flip'; dir: 1 | -1 };

type Regrip = Exclude<HandStep, { kind: 'twist' }>;

const E1 = [1, 0, 0], E3 = [0, 0, 1];

/** How each regrip turns the cube in the hand frame, and roughly what it costs in time. */
const REGRIPS: { step: Regrip; R: Mat3; cost: number }[] = [
  { step: { kind: 'yaw', quarters: 1 }, R: rotation(E3, Math.PI / 2), cost: 1 },
  { step: { kind: 'yaw', quarters: -1 }, R: rotation(E3, -Math.PI / 2), cost: 1 },
  { step: { kind: 'yaw', quarters: 2 }, R: rotation(E3, Math.PI), cost: 1.7 },
  { step: { kind: 'flip', dir: 1 }, R: rotation(E1, Math.PI / 2), cost: 1.25 },
  { step: { kind: 'flip', dir: -1 }, R: rotation(E1, -Math.PI / 2), cost: 1.35 },
];

const sameStep = (a: Regrip, b: Regrip) => (a.kind === 'yaw' && b.kind === 'yaw' ? a.quarters === b.quarters : a.kind === 'flip' && b.kind === 'flip' && a.dir === b.dir);

export const regripRotation = (s: Regrip): Mat3 => REGRIPS.find((r) => sameStep(r.step, s))!.R;

const key = (m: Mat3) => m.join(',');

/** The 24 ways the cube can sit in the hand, and the cheapest regrips between any two. */
function orientationGraph() {
  const all: Mat3[] = [IDENTITY];
  for (let i = 0; i < all.length; i++) {
    for (const r of REGRIPS) {
      const next = mul(r.R, all[i]);
      if (!all.some((o) => key(o) === key(next))) all.push(next);
    }
  }
  const index = new Map(all.map((o, i) => [key(o), i]));
  // Dijkstra from every orientation; 24 nodes, so the simple O(n²) form is plenty.
  const routes = all.map((from) => {
    const cost = all.map(() => Infinity);
    const via: (Regrip[] | null)[] = all.map(() => null);
    const start = index.get(key(from))!;
    cost[start] = 0;
    via[start] = [];
    const done = new Set<number>();
    while (done.size < all.length) {
      let u = -1;
      for (let i = 0; i < all.length; i++) if (!done.has(i) && (u < 0 || cost[i] < cost[u])) u = i;
      done.add(u);
      for (const r of REGRIPS) {
        const v = index.get(key(mul(r.R, all[u])))!;
        if (cost[u] + r.cost < cost[v]) {
          cost[v] = cost[u] + r.cost;
          via[v] = [...via[u]!, r.step];
        }
      }
    }
    return { cost, via: via as Regrip[][] };
  });
  return { all, index, routes };
}

let graph: ReturnType<typeof orientationGraph> | null = null;

/** Which face of the cube points along `dir` (hand frame) when it sits as `O`. */
export function faceAlong(O: Mat3, dir: readonly number[]): number {
  return FACE_NORMALS.findIndex((n) => {
    const v = apply(O, n);
    return v[0] === dir[0] && v[1] === dir[1] && v[2] === dir[2];
  });
}

/** Regrips and top twists for `solution`, starting with the cube sitting as `start`; the fewest, cheapest regrips overall. */
export function handSteps(solution: Move[], start: Mat3 = IDENTITY): { steps: HandStep[]; end: Mat3 } {
  const g = (graph ??= orientationGraph());
  const s0 = g.index.get(key(start));
  if (s0 === undefined) throw new Error('start is not a cube orientation');
  const up = (face: number) => g.all.map((o, i) => (faceAlong(o, E3) === face ? i : -1)).filter((i) => i >= 0);
  // Viterbi over the orientations that put each move's face on top.
  let layer = new Map<number, { cost: number; back: number[] }>([[s0, { cost: 0, back: [] }]]);
  for (const m of solution) {
    const next = new Map<number, { cost: number; back: number[] }>();
    for (const o of up(m.face)) {
      let best: { cost: number; back: number[] } | null = null;
      for (const [p, v] of layer) {
        const c = v.cost + g.routes[p].cost[o];
        if (!best || c < best.cost) best = { cost: c, back: [...v.back, o] };
      }
      next.set(o, best!);
    }
    layer = next;
  }
  const finish = [...layer.values()].reduce((a, b) => (b.cost < a.cost ? b : a));
  const steps: HandStep[] = [];
  let at = s0;
  finish.back.forEach((o, i) => {
    steps.push(...g.routes[at].via[o], { kind: 'twist', move: solution[i] });
    at = o;
  });
  return { steps, end: g.all[at] };
}
