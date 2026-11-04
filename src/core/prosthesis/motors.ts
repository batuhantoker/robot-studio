/** A prosthesis as its wearer drives it: a few motors, each moving one or more joints through a fixed linkage. */

export interface MotorJoint {
  joint: string;
  /** This motor's share of the joint: offset + scale · motor. The first joint of a motor is its lead. */
  scale?: number;
  offset?: number;
}

export interface ProsthesisMotor {
  name: string;
  label: string;
  range: [number, number];
  home: number;
  /** Radians (a joint angle) or a unitless fraction, like a synergy that closes the whole hand. */
  unit?: 'rad' | 'fraction';
  /** What the motor does, shown in place of its joint list (a synergy moving many joints). */
  hint?: string;
  joints: MotorJoint[];
}

/** A named hand posture in motor values, such as a power grasp or a pointing index. */
export interface Grip {
  name: string;
  label: string;
  motors: Record<string, number>;
}

export interface Prosthesis {
  side: 'left' | 'right';
  control: 'myoelectric' | 'body-powered';
  /** A prosthesis worn by a person, or a dexterous robot hand; both move the same way. */
  kind?: 'prosthesis' | 'dexterous';
  motors: ProsthesisMotor[];
  grips?: Grip[];
}

export interface Drive {
  /** Index into the whole-robot joint vector. */
  k: number;
  scale: number;
  offset: number;
}

/** A driven joint: the sum of every motor's share, held to its limits. */
interface Row {
  k: number;
  offset: number;
  scales: number[];
  limits: [number, number];
}

export interface MotorMap {
  motors: ProsthesisMotor[];
  /** Per motor, the joints it moves, lead first. */
  drives: Drive[][];
  grips: Grip[];
  rows: Row[];
}

export function motorMap(p: Prosthesis, joints: { name: string; limits: [number, number] }[]): MotorMap {
  const names = joints.map((j) => j.name);
  const drives = p.motors.map((m) => m.joints.map((j) => {
    const k = names.indexOf(j.joint);
    if (k < 0) throw new Error(`prosthesis motor ${m.name}: no joint ${j.joint}`);
    return { k, scale: j.scale ?? 1, offset: j.offset ?? 0 };
  }));
  for (const [i, [lead]] of drives.entries()) if (!lead?.scale) throw new Error(`prosthesis motor ${p.motors[i].name}: its first joint must move with it`);
  const byK = new Map<number, Row>();
  drives.forEach((ds, i) => ds.forEach((d) => {
    const row = byK.get(d.k) ?? { k: d.k, offset: 0, scales: p.motors.map(() => 0), limits: joints[d.k].limits };
    row.offset += d.offset;
    row.scales[i] += d.scale;
    byK.set(d.k, row);
  }));
  return { motors: p.motors, drives, grips: p.grips ?? [], rows: [...byK.values()] };
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(Math.max(v, lo), hi);

/** Joint vector with every driven joint set from the motors (held to its limits); other joints keep `q`. */
export function jointsFor(map: MotorMap, motors: number[], q: number[]): number[] {
  const u = motors.map((v, i) => clamp(v, map.motors[i].range));
  const out = [...q];
  for (const r of map.rows) out[r.k] = clamp(r.scales.reduce((s, c, i) => s + c * u[i], r.offset), r.limits);
  return out;
}

const LEAD_WEIGHT = 1e3;

/**
 * Motor positions that best explain `q`: a least-squares fit over joints off their stops, with each motor's lead
 * weighted so it alone decides the motor whenever it is free. Too few free joints to tell the motors apart, and the
 * joints at their stops join the fit; a tiny ridge is the last resort.
 */
export function motorsOf(map: MotorMap, q: number[]): number[] {
  const free = (r: Row) => q[r.k] > r.limits[0] + 1e-6 && q[r.k] < r.limits[1] - 1e-6;
  const u = fit(map, q, map.rows.filter(free)) ?? fit(map, q, map.rows) ?? fit(map, q, map.rows, 1e-9);
  return u!.map((v, i) => clamp(v, map.motors[i].range));
}

function fit(map: MotorMap, q: number[], rows: Row[], ridge = 0): number[] | null {
  const n = map.motors.length;
  const leads = new Set(map.drives.map(([lead]) => lead.k));
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);
  for (const r of rows) {
    const w = leads.has(r.k) ? LEAD_WEIGHT : 1;
    const y = q[r.k] - r.offset;
    for (let i = 0; i < n; i++) {
      b[i] += w * r.scales[i] * y;
      for (let j = 0; j < n; j++) A[i][j] += w * r.scales[i] * r.scales[j];
    }
  }
  const size = Math.max(1e-12, ...A.map((row, i) => row[i]));
  A.forEach((row, i) => (row[i] += ridge * size));
  return solve(A, b, 1e-10 * size);
}

/** Gaussian elimination with partial pivoting (one to six motors); null when a pivot vanishes. */
function solve(A: number[][], b: number[], tiny: number): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    const p = M.reduce((best, row, r) => (r >= c && Math.abs(row[c]) > Math.abs(M[best][c]) ? r : best), c);
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) <= tiny) return null;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) x[r] = (M[r][n] - M[r].slice(r + 1, n).reduce((s, v, j) => s + v * x[r + 1 + j], 0)) / M[r][r];
  return x;
}

/** `q` moved onto the hand's linkage: the motors that best explain it, then every joint they drive. */
export const couple = (map: MotorMap, q: number[]): number[] => jointsFor(map, motorsOf(map, q), q);

/** Whether `q` lies on the linkage. */
export const onLinkage = (map: MotorMap, q: number[], tol = 1e-6): boolean =>
  couple(map, q).every((v, k) => Math.abs(v - q[k]) <= tol);

/** Motor values for a grip, starting from `motors` for any motor the grip leaves out. */
export const gripMotors = (map: MotorMap, grip: Grip, motors: number[]): number[] =>
  map.motors.map((m, i) => clamp(grip.motors[m.name] ?? motors[i], m.range));
