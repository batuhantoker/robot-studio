/**
 * The 26 visible pieces as they sit in space, for drawing the cube and checking a solve by its stickers.
 * Cube frame: R = +x, B = +y, U = +z (so F faces −y); a piece's rotation R takes its home frame to where it is now.
 */
import type { Move } from './cube';

export type Mat3 = number[];
export type Int3 = [number, number, number];

/** Outward normal of U R F D L B. */
export const FACE_NORMALS: Int3[] = [[0, 0, 1], [1, 0, 0], [0, -1, 0], [0, 0, -1], [-1, 0, 0], [0, 1, 0]];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const mul = (a: Mat3, b: Mat3): Mat3 =>
  [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]));

export const apply = (m: Mat3, v: readonly number[]): Int3 =>
  [0, 1, 2].map((i) => m[3 * i] * v[0] + m[3 * i + 1] * v[1] + m[3 * i + 2] * v[2]) as Int3;

export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** Rotation by `angle` about a unit axis (right hand), Rodrigues; whole quarter turns come out exact. */
export function rotation(axis: readonly number[], angle: number): Mat3 {
  const [x, y, z] = axis;
  const quarter = Math.abs(angle / (Math.PI / 2) - Math.round(angle / (Math.PI / 2))) < 1e-9;
  const c = quarter ? Math.round(Math.cos(angle)) : Math.cos(angle);
  const s = quarter ? Math.round(Math.sin(angle)) : Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

export interface Piece {
  home: Int3;
  R: Mat3;
}

export function solvedPieces(): Piece[] {
  const out: Piece[] = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (x || y || z) out.push({ home: [x, y, z], R: IDENTITY });
  }
  return out;
}

export const where = (p: Piece): Int3 => apply(p.R, p.home);

export const inLayer = (p: Piece, face: number): boolean => {
  const n = FACE_NORMALS[face];
  const at = where(p);
  return at[0] * n[0] + at[1] * n[1] + at[2] * n[2] === 1;
};

/** Clockwise as seen from outside the face: a negative turn about its outward normal. */
export const turnOf = (m: Move): Mat3 => rotation(FACE_NORMALS[m.face], (-m.turns * Math.PI) / 2);

export function turnPieces(ps: Piece[], m: Move): Piece[] {
  const r = turnOf(m);
  return ps.map((p) => (inLayer(p, m.face) ? { home: p.home, R: mul(r, p.R) } : p));
}

export const turnAll = (ps: Piece[], moves: Move[]): Piece[] => moves.reduce(turnPieces, ps);

/** Every sticker faces the side of its colour; a centre may spin in place. */
export const piecesSolved = (ps: Piece[]): boolean =>
  ps.every((p) => p.home.every((v, k) => {
    if (!v) return true;
    const s: Int3 = [0, 0, 0];
    s[k] = v;
    const now = apply(p.R, s);
    return now[0] === s[0] && now[1] === s[1] && now[2] === s[2];
  }));
