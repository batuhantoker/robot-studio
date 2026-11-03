/**
 * Bounded position-only damped least squares, ported from SerialArm.inverse_kinematics:
 * Δq = Jᵀ (J Jᵀ + λ² I)⁻¹ e with λ = 10⁻³ max(‖J‖_F, 10⁻³), ‖Δq‖ ≤ 0.5, and halving backtracks.
 * Restarts draw from mulberry32, not NumPy, so restart samples differ from Python.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import { jacobianAt } from '../../chain/kinematics/jacobian';
import type { Chain } from '../../chain/model/types';
import { frobenius, gram, solve3, transposeTimes } from '../../math/decompose/solve';
import { type Vec3, norm, sub } from '../../math/linear/vec';
import { rng, uniform } from '../../math/random/rng';
import type { IkOptions, IkResult, IkStep } from './types';

const clip = (chain: Chain, q: number[]) =>
  q.map((v, i) => Math.min(Math.max(v, chain.joints[i].limits[0]), chain.joints[i].limits[1]));

const toolError = (chain: Chain, goal: Vec3, q: number[]) => norm(sub(goal, chainFrames(chain, q).tip.p));

function dlsStep(chain: Chain, goal: Vec3, q: number[]) {
  const f = chainFrames(chain, q);
  const error = sub(goal, f.tip.p);
  const J = jacobianAt(chain, f, f.tip.p).Jv;
  const lambda = 1e-3 * Math.max(frobenius(J), 1e-3);
  const A = gram(J).map((v, i) => (i % 4 === 0 ? v + lambda * lambda : v)) as Parameters<typeof solve3>[0];
  const step = transposeTimes(J, solve3(A, error));
  const size = Math.hypot(...step);
  const shrink = Math.min(1, 0.5 / Math.max(size, 1e-15));
  return { error, lambda, step: step.map((v) => v * shrink) };
}

export function inverseKinematics(chain: Chain, goal: Vec3, q0?: number[], opts: IkOptions = {}): IkResult {
  const { tol = 1e-5, maxIter = 200, restarts = 4, seed = 0 } = opts;
  const next = rng(seed);
  let bestQ = clip(chain, q0 ?? chain.joints.map(() => 0));
  let bestError = Infinity;
  const steps: IkStep[] = [];
  for (let attempt = 0; attempt <= restarts; attempt++) {
    let q = attempt === 0 ? [...bestQ] : chain.joints.map((j) => uniform(next, j.limits[0], j.limits[1]));
    for (let iteration = 0; iteration <= maxIter; iteration++) {
      const residual = toolError(chain, goal, q);
      if (residual < bestError) [bestQ, bestError] = [[...q], residual];
      if (residual <= tol) {
        steps.push({ attempt, iteration, q: [...q], residual, lambda: 0, stepNorm: 0, backtracks: 0 });
        return { q, success: true, residual, steps };
      }
      if (iteration === maxIter) break;
      const { lambda, step } = dlsStep(chain, goal, q);
      let accepted = -1;
      for (let b = 0; b < 12 && accepted < 0; b++) {
        const candidate = clip(chain, q.map((v, i) => v + step[i] * 0.5 ** b));
        if (toolError(chain, goal, candidate) < residual) [q, accepted] = [candidate, b];
      }
      steps.push({ attempt, iteration, q: [...q], residual, lambda, stepNorm: Math.hypot(...step), backtracks: accepted });
      if (accepted < 0) break;
    }
  }
  return { q: bestQ, success: false, residual: bestError, steps };
}
