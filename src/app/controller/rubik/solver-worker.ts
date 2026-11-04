/** Builds the two-phase tables and solves scrambles off the main thread; the tables take about half a second. */
import { applyMoves, scramble, solvedCube } from '../../../core/rubik/cube';
import { solve } from '../../../core/rubik/solver';

export interface SolveRequest {
  seed: number;
}

function solveSeed(seed: number) {
  const moves = scramble(seed);
  return { seed, scramble: moves, solution: solve(applyMoves(solvedCube(), moves), { target: 20, budgetMs: 600 }) };
}

const scope = self as unknown as { onmessage: ((e: MessageEvent<SolveRequest>) => void) | null; postMessage(v: unknown): void };
scope.onmessage = (e) => scope.postMessage(solveSeed(e.data.seed));
