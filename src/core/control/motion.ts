/** Whether a test motion tests anything: a plan fitted clear of contact can shrink to nothing, and holding still scores 100. */

/** Below this a joint is holding, not moving (rad, or m on a slide). */
const STILL = 1e-3;

export const movesJoints = (waypoints: number[][], joints: number[]): boolean =>
  joints.some((k) => waypoints.some((w) => Math.abs(w[k] - waypoints[0][k]) > STILL));
