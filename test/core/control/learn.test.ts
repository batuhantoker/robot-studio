import { describe, expect, it } from 'vitest';
import { firstGuess, gainRange, inertiaRule } from '@/core/control/gains';
import { decode, encode } from '@/core/control/learn/params';
import { type Search, crossEntropy, policyGradient } from '@/core/control/learn/search';

const goal = [1.5, -2, 0.5, 3];
const reward = (x: number[]) => -x.reduce((s, v, i) => s + (v - goal[i]) ** 2, 0);

function learn(search: Search, rounds: number): number[] {
  for (let i = 0; i < rounds; i++) search.tell(search.ask().map(reward));
  return search.mean();
}

describe.each([['cross-entropy', crossEntropy], ['policy gradient', policyGradient]] as const)('%s', (_, make) => {
  const options = { start: [0, 0, 0, 0], sigma: 1, population: 16 };

  it('finds the top of a reward it only ever samples', () => {
    expect(reward(learn(make({ ...options, seed: 3 }), 60))).toBeGreaterThan(-0.05);
  });

  it('repeats exactly for a seed and differs for another', () => {
    expect(learn(make({ ...options, seed: 7 }), 5)).toEqual(learn(make({ ...options, seed: 7 }), 5));
    expect(learn(make({ ...options, seed: 7 }), 5)).not.toEqual(learn(make({ ...options, seed: 8 }), 5));
  });
});

describe('gains', () => {
  const inertia = [2, 0.5, 0.01];

  it('starts every joint on the same numbers, so light joints are far off the rule', () => {
    const guess = firstGuess(inertia);
    const rule = inertiaRule(inertia);
    expect(new Set(guess.map((g) => g.kp)).size).toBe(1);
    expect(guess[2].kp / rule[2].kp).toBeGreaterThan(5 * (guess[0].kp / rule[0].kp));
  });

  it('survives the trip through the learner’s log space', () => {
    const space = { joints: [0, 2], inertia };
    const start = inertiaRule(inertia).map((g) => ({ ...g, ki: 1 }));
    const back = decode(encode(start, space), start, space);
    expect(back[0].kp).toBeCloseTo(start[0].kp, 6);
    expect(back[2].kd).toBeCloseTo(start[2].kd, 6);
    expect(back[1]).toEqual(start[1]);
  });

  it('holds what a learner proposes inside the range', () => {
    const space = { joints: [0], inertia };
    const out = decode([50, 50, 50], inertiaRule(inertia), space);
    expect(out[0].kp).toBe(gainRange(inertia[0], 'kp').hi);
  });
});
