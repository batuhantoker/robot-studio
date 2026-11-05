/** The small stand that presents an object: a mast off to the side, an arm in, a tip up to a cradle under the object. */
import type { Vec3 } from '../math/linear/vec';

export interface Stand {
  /** Where the cradle meets the object at its seat. */
  at: Vec3;
  /** −1 with its mast towards −x, the little-finger side of a right hand. */
  side: number;
  /** How far below the cradle the arm runs, and how far out the mast stands. */
  tip?: number;
  reach?: number;
  /** A fixed rail instead: the tops of two posts down to the floor. The object never leaves them. */
  posts?: [Vec3, Vec3];
}

export interface Rod {
  a: Vec3;
  b: Vec3;
  radius: number;
}

const TIP = 0.03;
const REACH = 0.11;
const ROD = 0.0035;
const MAST = 0.005;

/** The height of its arm at the seat, which limits how far it can sink before it meets the floor. */
export const armHeight = (s: Stand): number => s.at[2] - (s.tip ?? TIP);

/** The stand as rods, moved by `offset` from its seat, its mast down to `floor`. */
export function standRods(s: Stand, offset: Vec3, floor: number): Rod[] {
  if (s.posts) {
    return s.posts.flatMap((a): Rod[] => [
      { a, b: [a[0], a[1], floor], radius: MAST },
      { a, b: [a[0], s.at[1], s.at[2]], radius: ROD },
    ]);
  }
  const top: Vec3 = [s.at[0] + offset[0], s.at[1] + offset[1], s.at[2] + offset[2]];
  const elbow: Vec3 = [top[0], top[1], top[2] - (s.tip ?? TIP)];
  const shoulder: Vec3 = [elbow[0] + s.side * (s.reach ?? REACH), elbow[1], elbow[2]];
  return [
    { a: top, b: elbow, radius: ROD },
    { a: elbow, b: shoulder, radius: ROD },
    { a: shoulder, b: [shoulder[0], shoulder[1], floor], radius: MAST },
  ];
}
