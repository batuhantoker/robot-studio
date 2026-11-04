import { describe, expect, it } from 'vitest';
import { applyMoves, scramble, solvedCube } from '@/core/rubik/cube';
import { type HandStep, faceAlong, handSteps, regripRotation } from '@/core/rubik/plan';
import { IDENTITY, type Mat3, type Piece, mul, piecesSolved, solvedPieces, turnAll, turnPieces } from '@/core/rubik/pieces';
import { solve } from '@/core/rubik/solver';

/** Perform the steps physically: regrips turn the cube in the hand, twists turn whatever face is on top. */
function perform(pieces: Piece[], O: Mat3, steps: HandStep[]) {
  for (const s of steps) {
    if (s.kind === 'twist') {
      const top = faceAlong(O, [0, 0, 1]);
      expect(top).toBe(s.move.face);
      pieces = turnPieces(pieces, { face: top, turns: s.move.turns });
    } else O = mul(regripRotation(s), O);
  }
  return { pieces, O };
}

describe('pieces', () => {
  it('agree with the cubie model: a scramble and its solve leave every sticker home', () => {
    for (let seed = 3; seed < 8; seed++) {
      const s = scramble(seed * 104729);
      const moves = solve(applyMoves(solvedCube(), s));
      expect(piecesSolved(turnAll(solvedPieces(), s))).toBe(false);
      expect(piecesSolved(turnAll(solvedPieces(), [...s, ...moves]))).toBe(true);
    }
  });
});

describe('hand steps', () => {
  it('solve the cube by top twists and regrips alone', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = scramble(seed * 7717);
      const moves = solve(applyMoves(solvedCube(), s));
      const { steps, end } = handSteps(moves);
      const done = perform(turnAll(solvedPieces(), s), IDENTITY, steps);
      expect(piecesSolved(done.pieces)).toBe(true);
      expect(done.O).toEqual(end);
      expect(steps.filter((x) => x.kind === 'twist')).toHaveLength(moves.length);
      const regrips = steps.length - moves.length;
      expect(regrips).toBeLessThanOrEqual(2 * moves.length);
      console.log(moves.length, 'twists', regrips, 'regrips');
    }
  });

  it('needs no regrip for turns of the top face', () => {
    expect(handSteps([{ face: 0, turns: 1 }, { face: 0, turns: 2 }]).steps.every((s) => s.kind === 'twist')).toBe(true);
  });
});
