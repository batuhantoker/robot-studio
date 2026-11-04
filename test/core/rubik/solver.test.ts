import { describe, expect, it } from 'vitest';
import { applyMoves, inverse, isSolvedCubie, parseMoves, scramble, solvedCube } from '@/core/rubik/cube';
import { flipOf, sliceOf, solve, tables, twistOf } from '@/core/rubik/solver';

describe('cubie cube', () => {
  it('returns home after four quarter turns of any face, and after six sexy moves', () => {
    for (let face = 0; face < 6; face++) expect(isSolvedCubie(applyMoves(solvedCube(), Array(4).fill({ face, turns: 1 })))).toBe(true);
    const sexy = parseMoves("R U R' U'");
    expect(isSolvedCubie(applyMoves(solvedCube(), Array(6).fill(sexy).flat()))).toBe(true);
    expect(isSolvedCubie(applyMoves(solvedCube(), sexy))).toBe(false);
  });

  it('undoes a scramble with its inverse', () => {
    const s = scramble(7);
    expect(isSolvedCubie(applyMoves(applyMoves(solvedCube(), s), inverse(s)))).toBe(true);
  });

  it('keeps phase-1 coordinates at zero under phase-2 moves', () => {
    const c = applyMoves(solvedCube(), parseMoves('U R2 D F2 L2 U2 B2'));
    expect([twistOf(c), flipOf(c), sliceOf(c)]).toEqual([0, 0, 0]);
  });
});

describe('two-phase solver', () => {
  it('builds its tables', () => {
    const t0 = Date.now();
    tables();
    console.log(`tables ${Date.now() - t0} ms`);
  });

  it('solves random scrambles in about twenty moves', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const cube = applyMoves(solvedCube(), scramble(seed * 7919));
      const t0 = Date.now();
      const moves = solve(cube);
      const ms = Date.now() - t0;
      expect(isSolvedCubie(applyMoves(cube, moves))).toBe(true);
      expect(moves.length).toBeLessThanOrEqual(23);
      console.log(seed, moves.length, `${ms} ms`);
    }
  });

  it('returns nothing for a solved cube', () => {
    expect(solve(solvedCube())).toEqual([]);
  });
});
