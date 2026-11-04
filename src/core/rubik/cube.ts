/**
 * A Rubik's cube as Kociemba's two-phase solver sees it: which corner and edge piece sits in each slot, and how
 * it is twisted. Faces are U R F D L B (0..5); a move is a face and 1..3 clockwise quarter turns.
 */

export const FACE_NAMES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;

export interface Move {
  face: number;
  turns: 1 | 2 | 3;
}

export interface CubieCube {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

export const solvedCube = (): CubieCube => ({
  cp: [0, 1, 2, 3, 4, 5, 6, 7],
  co: [0, 0, 0, 0, 0, 0, 0, 0],
  ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

// Corners URF UFL ULB UBR DFR DLF DBL DRB; edges UR UF UL UB DR DF DL DB FR FL BL BR. Slot i takes the piece from slot cp[i].
const Z8 = [0, 0, 0, 0, 0, 0, 0, 0];
const Z12 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
export const BASIC: CubieCube[] = [
  { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: Z8, ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: Z12 },
  { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: Z12 },
  { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] },
  { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: Z8, ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: Z12 },
  { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: Z12 },
  { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] },
];

/** `a` followed by `b`. */
export function multiply(a: CubieCube, b: CubieCube): CubieCube {
  return {
    cp: b.cp.map((p) => a.cp[p]),
    co: b.cp.map((p, i) => (a.co[p] + b.co[i]) % 3),
    ep: b.ep.map((p) => a.ep[p]),
    eo: b.ep.map((p, i) => (a.eo[p] + b.eo[i]) % 2),
  };
}

export function applyMove(c: CubieCube, m: Move): CubieCube {
  let out = c;
  for (let k = 0; k < m.turns; k++) out = multiply(out, BASIC[m.face]);
  return out;
}

export const applyMoves = (c: CubieCube, moves: Move[]): CubieCube => moves.reduce(applyMove, c);

export const isSolvedCubie = (c: CubieCube): boolean =>
  c.cp.every((p, i) => p === i) && c.ep.every((p, i) => p === i) && c.co.every((o) => o === 0) && c.eo.every((o) => o === 0);

export const inverse = (moves: Move[]): Move[] => [...moves].reverse().map((m) => ({ face: m.face, turns: (4 - m.turns) as Move['turns'] }));

export const moveText = (m: Move): string => FACE_NAMES[m.face] + (m.turns === 1 ? '' : m.turns === 2 ? '2' : "'");

export const movesText = (moves: Move[]): string => moves.map(moveText).join(' ');

export function parseMoves(text: string): Move[] {
  return text.trim().split(/\s+/).filter(Boolean).map((tok) => {
    const face = FACE_NAMES.indexOf(tok[0] as (typeof FACE_NAMES)[number]);
    const turns = tok[1] === '2' ? 2 : tok[1] === "'" ? 3 : 1;
    if (face < 0 || tok.length > 2) throw new Error(`not a face turn: ${tok}`);
    return { face, turns };
  });
}

/** Deterministic in `seed`; no face twice in a row and no U D U-style runs, like a competition scramble. */
export function scramble(seed: number, length = 22): Move[] {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const out: Move[] = [];
  while (out.length < length) {
    const face = Math.floor(rand() * 6);
    const last = out[out.length - 1]?.face;
    const before = out[out.length - 2]?.face;
    if (face === last || (last !== undefined && face % 3 === last % 3 && before === face)) continue;
    out.push({ face, turns: (1 + Math.floor(rand() * 3)) as Move['turns'] });
  }
  return out;
}
