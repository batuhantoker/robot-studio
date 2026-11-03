export interface IkOptions {
  tol?: number;
  maxIter?: number;
  restarts?: number;
  seed?: number;
}

/** One accepted (or final) iterate, kept so the UI can replay convergence. */
export interface IkStep {
  attempt: number;
  iteration: number;
  q: number[];
  residual: number;
  lambda: number;
  stepNorm: number;
  backtracks: number;
}

export interface IkResult {
  q: number[];
  success: boolean;
  residual: number;
  steps: IkStep[];
}
