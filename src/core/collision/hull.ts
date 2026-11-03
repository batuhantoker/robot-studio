/** Collision volumes that stand in for a robot's parts, each riding one chain frame. */
import type { Transform } from '../math/linear/transform';

export type HullShape = 'box' | 'cylinder' | 'sphere' | 'capsule';

export interface HullVolume {
  /** Chain joint whose moved frame carries the volume; -1 is the fixed world. */
  body: number;
  shape: HullShape;
  /** MuJoCo sizes: box half-extents; cylinder/capsule radius and half-length along local z; sphere radius. */
  size: number[];
  pose: Transform;
  /** Assembly module it belongs to, for naming contacts. */
  module: string;
}

/** Who touched whom; `b` is 'floor' for ground contact. */
export interface Contact {
  a: string;
  b: string;
}

export const contactText = (c: Contact) => `${c.a} ↔ ${c.b}`;
