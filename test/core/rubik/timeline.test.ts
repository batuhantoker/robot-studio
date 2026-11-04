import { describe, expect, it } from 'vitest';
import { applyMoves, scramble, solvedCube } from '@/core/rubik/cube';
import { IDENTITY, type Piece, mul, piecesSolved, rotation, turnPieces } from '@/core/rubik/pieces';
import { solve } from '@/core/rubik/solver';
import { type CubeAt, solveClip } from '@/core/rubik/timeline';

/** The cube as drawn, in the hand frame; centres are left out, as one looks the same however it has spun. */
const drawn = (c: CubeAt) => c.pieces
  .filter((p: Piece) => p.home.filter(Boolean).length > 1)
  .map((p) => mul(c.R, c.turning ? turnLayer(p, c.turning) : p.R).map((v) => Math.round(v * 1e6) / 1e6));

function turnLayer(p: Piece, t: { face: number; angle: number }) {
  const turned = turnPieces([p], { face: t.face, turns: 1 })[0];
  if (turned === p) return p.R;
  const n = [[0, 0, 1], [1, 0, 0], [0, -1, 0], [0, 0, -1], [-1, 0, 0], [0, 1, 0]][t.face];
  return mul(rotation(n, t.angle), p.R);
}

describe('solve clip', () => {
  const s = scramble(4242);
  const moves = solve(applyMoves(solvedCube(), s));
  const clip = solveClip(s, moves);

  it('runs continuously: every beat ends where the next begins', () => {
    for (let i = 0; i + 1 < clip.segments.length; i++) {
      const next = clip.segments[i + 1];
      const end = clip.at(next.start - 1e-9), begin = clip.at(next.start + 1e-9);
      expect(drawn(end)).toEqual(drawn(begin));
      expect(end.lift).toBeCloseTo(begin.lift, 6);
    }
  });

  it('is solved at the end and loops back to the solved cube it started from', () => {
    const last = clip.at(clip.period - 1e-6);
    expect(piecesSolved(last.pieces)).toBe(true);
    expect(drawn(clip.at(clip.period + 1e-6))).toEqual(drawn(last));
    expect(clip.at(clip.segments[1].start).R).toEqual(IDENTITY);
    console.log(`${moves.length} moves, ${clip.segments.length} beats, ${clip.period.toFixed(1)} s`);
  });
});
