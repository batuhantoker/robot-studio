/** PID gains per joint: where tuning starts, the textbook rule, and the range a person or a learner may use. */

export interface Pid {
  kp: number;
  ki: number;
  kd: number;
}

export type GainKey = keyof Pid;
export const GAIN_KEYS: GainKey[] = ['kp', 'ki', 'kd'];

/** Natural frequency (rad/s) of the textbook rule, critically damped. */
const RULE_WN = 30;
/** The same numbers on every joint, sized for the heaviest: what a first attempt usually looks like. */
const GUESS_WN = 7;
const GUESS_KD_RATIO = 0.08;

const top = (inertia: number[]) => Math.max(...inertia, 1e-9);

export const firstGuess = (inertia: number[]): Pid[] => {
  const kp = top(inertia) * GUESS_WN ** 2;
  return inertia.map(() => ({ kp, ki: 0, kd: GUESS_KD_RATIO * kp }));
};

/** Each joint a critically damped second-order system: Kp = Mω², Kd = 2Mω. */
export const inertiaRule = (inertia: number[], wn = RULE_WN): Pid[] =>
  inertia.map((m) => ({ kp: m * wn ** 2, ki: 0, kd: 2 * m * wn }));

export interface GainRange {
  lo: number;
  hi: number;
}

/** Far enough either side of the rule to fail in both directions; Ki's bottom end reads as off. */
export function gainRange(inertia: number, key: GainKey, start = 0): GainRange {
  const rule = { kp: inertia * RULE_WN ** 2, ki: inertia * RULE_WN ** 3 * 0.1, kd: 2 * inertia * RULE_WN }[key];
  return { lo: Math.min(rule / 300, start || Infinity), hi: Math.max(rule * 30, start) };
}

export const clampGain = (v: number, r: GainRange) => Math.min(Math.max(v, r.lo), r.hi);
