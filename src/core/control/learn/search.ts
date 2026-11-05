/** Two ways to learn parameters from the score of each try alone: propose a batch (ask), hear how it did (tell). */
import { rng } from '../../math/random/rng';

export interface Search {
  ask(): number[][];
  tell(scores: number[]): void;
  /** The learner's current belief. */
  mean(): number[];
  /** How widely it is still exploring, averaged over parameters. */
  spread(): number;
}

export interface SearchOptions {
  start: number[];
  sigma: number;
  population: number;
  seed?: number;
}

function gaussian(next: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
}

const average = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1);

/** Cross-entropy method: keep the best quarter, then move and narrow the search around them. */
export function crossEntropy({ start, sigma, population, seed = 1 }: SearchOptions): Search {
  const normal = gaussian(rng(seed));
  const mu = [...start];
  const sd = start.map(() => sigma);
  let batch: number[][] = [];
  // Elites alone collapse the spread too early (Szita & Lörincz); fading noise holds it open.
  let noise = 0.25 * sigma ** 2;
  return {
    ask() {
      batch = Array.from({ length: population }, () => mu.map((m, i) => m + sd[i] * normal()));
      return batch;
    },
    tell(scores) {
      const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
      const elite = order.slice(0, Math.max(2, Math.round(population / 4))).map((i) => batch[i]);
      mu.forEach((_, d) => {
        const m = average(elite.map((e) => e[d]));
        const v = average(elite.map((e) => (e[d] - m) ** 2));
        mu[d] = 0.7 * m + 0.3 * mu[d];
        sd[d] = Math.max(Math.sqrt(v + noise), 0.02);
      });
      noise *= 0.93;
    },
    mean: () => [...mu],
    spread: () => average(sd),
  };
}

/** REINFORCE over a Gaussian policy on the parameters, one episode per try; mirrored pairs and centred ranks replace a baseline. */
export function policyGradient({ start, sigma, population, seed = 1 }: SearchOptions): Search {
  const normal = gaussian(rng(seed));
  const mu = [...start];
  const sd = start.map(() => sigma);
  const pairs = Math.max(1, Math.floor(population / 2));
  let noise: number[][] = [];
  return {
    ask() {
      noise = Array.from({ length: pairs }, () => mu.map(() => normal()));
      return noise.flatMap((e) => [mu.map((m, i) => m + sd[i] * e[i]), mu.map((m, i) => m - sd[i] * e[i])]);
    },
    tell(scores) {
      const order = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
      const advantage = new Array<number>(scores.length);
      order.forEach((i, rank) => (advantage[i] = rank / Math.max(scores.length - 1, 1) - 0.5));
      mu.forEach((_, d) => {
        let dMu = 0, dSd = 0;
        noise.forEach((e, p) => {
          const plus = advantage[2 * p], minus = advantage[2 * p + 1];
          dMu += (plus - minus) * e[d];
          dSd += (plus + minus) * (e[d] ** 2 - 1);
        });
        mu[d] += (1.2 * sd[d] * dMu) / pairs;
        sd[d] = Math.min(Math.max(sd[d] * Math.exp((0.6 * dSd) / pairs), 0.02), 2);
      });
    },
    mean: () => [...mu],
    spread: () => average(sd),
  };
}
