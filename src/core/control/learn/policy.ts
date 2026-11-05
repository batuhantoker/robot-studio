/** A one-layer network from what the body feels to how far each output pushes: tanh(W·obs + b). */

export interface PolicyShape {
  inputs: number;
  outputs: number;
}

export const policySize = ({ inputs, outputs }: PolicyShape) => (inputs + 1) * outputs;

export function runPolicy(theta: ArrayLike<number>, { inputs, outputs }: PolicyShape, obs: ArrayLike<number>, out: number[]): void {
  for (let j = 0; j < outputs; j++) {
    let s = theta[inputs * outputs + j];
    for (let i = 0; i < inputs; i++) s += theta[j * inputs + i] * obs[i];
    out[j] = Math.tanh(s);
  }
}
