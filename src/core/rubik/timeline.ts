/**
 * The solve as one looping clip: the cube shuffles itself into the scramble, the hand solves it step by step, and
 * the solved cube is held up before the next round. Times are seconds; the cube is posed in the hand frame of plan.ts.
 */
import type { Move } from './cube';
import { type HandStep, handSteps, regripRotation } from './plan';
import { FACE_NORMALS, IDENTITY, type Mat3, type Piece, mul, rotation, solvedPieces, turnAll, turnPieces } from './pieces';

/** One quarter of hand work; half turns and half yaws are two of them. */
export type Primitive = 'cw' | 'ccw' | 'yawL' | 'yawR' | 'flipFar' | 'flipNear';

export type Beat =
  | { kind: Primitive; move?: Move }
  | { kind: 'scramble'; moves: Move[] }
  | { kind: 'hold' };

/** How long each beat takes, and the share of it in which the cube (or its top layer) moves. */
export const TIMING: Record<Primitive | 'scramble' | 'hold', { duration: number; from: number; to: number }> = {
  cw: { duration: 0.95, from: 0.3, to: 0.78 },
  ccw: { duration: 0.95, from: 0.3, to: 0.78 },
  yawL: { duration: 1.15, from: 0.3, to: 0.8 },
  yawR: { duration: 1.15, from: 0.3, to: 0.8 },
  flipFar: { duration: 1.35, from: 0.28, to: 0.8 },
  flipNear: { duration: 1.35, from: 0.28, to: 0.8 },
  scramble: { duration: 2.6, from: 0.12, to: 0.88 },
  hold: { duration: 1, from: 0, to: 0 },
};

export const smoother = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10));

/** How far the beat's motion has gone at `phase` (0..1). */
export const progress = (kind: Beat['kind'], phase: number) => {
  const t = TIMING[kind];
  return t.to > t.from ? smoother((phase - t.from) / (t.to - t.from)) : 0;
};

export interface Segment {
  beat: Beat;
  start: number;
  duration: number;
  /** The cube as the beat finds it. */
  pieces: Piece[];
  O: Mat3;
  /** Index of the solution move this beat belongs to (−1 before the solve). */
  move: number;
}

export interface CubeAt {
  segment: number;
  phase: number;
  pieces: Piece[];
  turning: { face: number; angle: number } | null;
  /** The whole cube's rotation in the hand frame and how far its centre is raised off the palm (m). */
  R: Mat3;
  lift: number;
}

const HALF = 0.0285;

function quarters(step: HandStep): Primitive[] {
  if (step.kind === 'twist') return step.move.turns === 2 ? ['cw', 'cw'] : [step.move.turns === 1 ? 'cw' : 'ccw'];
  if (step.kind === 'yaw') return step.quarters === 2 ? ['yawL', 'yawL'] : [step.quarters === 1 ? 'yawL' : 'yawR'];
  return [step.dir === 1 ? 'flipFar' : 'flipNear'];
}

const topFace = (O: Mat3) => FACE_NORMALS.findIndex((n) => O[6] * n[0] + O[7] * n[1] + O[8] * n[2] === 1);

/** How far a part-turned layer's corners would dip below the cube's bottom, so it can rock up off the palm by that. */
function dip(O: Mat3, face: number, angle: number): number {
  const turn = mul(O, rotation(FACE_NORMALS[face], angle));
  const n = FACE_NORMALS[face];
  let low = 0;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const c = [x, y, z];
    if (c[0] * n[0] + c[1] * n[1] + c[2] * n[2] !== 1) continue;
    low = Math.min(low, (turn[6] * x + turn[7] * y + turn[8] * z) * HALF);
  }
  return Math.max(0, -low - HALF);
}

export interface SolveClip {
  segments: Segment[];
  period: number;
  steps: HandStep[];
  solution: Move[];
  at(t: number): CubeAt;
}

export function solveClip(scramble: Move[], solution: Move[], start: Mat3 = IDENTITY): SolveClip {
  const { steps } = handSteps(solution, start);
  const segments: Segment[] = [];
  let t = 0;
  let pieces = solvedPieces();
  let O = start;
  const push = (beat: Beat, move: number, duration = TIMING[beat.kind].duration) => {
    segments.push({ beat, start: t, duration, pieces, O, move });
    t += duration;
  };
  push({ kind: 'scramble', moves: scramble }, -1);
  pieces = turnAll(pieces, scramble);
  push({ kind: 'hold' }, -1, 0.8);
  let move = -1;
  for (const step of steps) {
    if (step.kind === 'twist') move++;
    for (const kind of quarters(step)) {
      const turn: Move | undefined = step.kind === 'twist' ? { face: topFace(O), turns: kind === 'cw' ? 1 : 3 } : undefined;
      push({ kind, move: turn }, move);
      if (turn) pieces = turnPieces(pieces, turn);
      else O = mul(regripRotation(kind === 'yawL' ? { kind: 'yaw', quarters: 1 } : kind === 'yawR' ? { kind: 'yaw', quarters: -1 } : { kind: 'flip', dir: kind === 'flipFar' ? 1 : -1 }), O);
    }
  }
  push({ kind: 'hold' }, solution.length, 2.2);
  const period = t;

  const at = (time: number): CubeAt => {
    const tt = ((time % period) + period) % period;
    let i = segments.length - 1;
    while (i > 0 && segments[i].start > tt) i--;
    const s = segments[i];
    const phase = Math.min(1, (tt - s.start) / s.duration);
    const f = progress(s.beat.kind, phase);
    const base: CubeAt = { segment: i, phase, pieces: s.pieces, turning: null, R: s.O, lift: 0 };
    const b = s.beat;
    if (b.kind === 'hold') return base;
    if (b.kind === 'scramble') {
      // The cube shuffles itself on the open palm, rocking up only as far as a turning side layer needs.
      const n = b.moves.length, x = f * n, k = Math.min(Math.floor(x), n);
      const m = b.moves[k];
      const angle = m && x > k ? (-m.turns * Math.PI) / 2 * smoother(x - k) : 0;
      return {
        ...base,
        pieces: turnAll(s.pieces, b.moves.slice(0, k)),
        turning: angle ? { face: m.face, angle } : null,
        lift: angle ? dip(s.O, m.face, angle) : 0,
      };
    }
    if (b.kind === 'cw' || b.kind === 'ccw') {
      const face = b.move!.face;
      return { ...base, turning: f > 0 ? { face, angle: (b.kind === 'cw' ? -1 : 1) * f * Math.PI / 2 } : null };
    }
    if (b.kind === 'yawL' || b.kind === 'yawR') return { ...base, R: mul(rotation([0, 0, 1], (b.kind === 'yawL' ? 1 : -1) * f * Math.PI / 2), s.O) };
    // Rolled in place: the centre rises just enough for the lowest edge to stay on the palm.
    const angle = f * Math.PI / 2;
    return { ...base, R: mul(rotation([1, 0, 0], (b.kind === 'flipFar' ? 1 : -1) * angle), s.O), lift: HALF * (Math.cos(angle) + Math.sin(angle) - 1) };
  };

  return { segments, period, steps, solution, at };
}
