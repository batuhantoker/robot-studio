/** Scrambles solved in a worker, one at a time; the latest request wins. */
import type { Move } from '../../../core/rubik/cube';

export interface Solved {
  seed: number;
  scramble: Move[];
  solution: Move[];
}

export class SolverClient {
  private worker: Worker | null = null;
  private wanted = -1;

  solve(seed: number, done: (s: Solved) => void): void {
    this.wanted = seed;
    this.worker ??= new Worker(new URL('./solver-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<Solved>) => e.data.seed === this.wanted && done(e.data);
    this.worker.postMessage({ seed });
  }
}
