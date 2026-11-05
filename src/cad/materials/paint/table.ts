/** Real paint schemes for imported robots whose models carry no colour. Every row traces to a source. */
import type { Vec3 } from '../../../core/math/linear/vec';
import type { MaterialClass } from '../classes/types';
import { ABB } from './makers/abb';
import { COBOTS } from './makers/cobots';
import { EPSON } from './makers/epson';
import { FANUC } from './makers/fanuc';
import { FIELD } from './makers/field';
import { HUMANOIDS } from './makers/humanoids';
import { JAKA } from './makers/jaka';
import { KAWASAKI } from './makers/kawasaki';
import { KUKA } from './makers/kuka';
import { MITSUBISHI } from './makers/mitsubishi';
import { QUADRUPEDS } from './makers/quadrupeds';
import { UNITREE } from './makers/unitree';
import { UNIVERSAL } from './makers/universal';
import { YASKAWA } from './makers/yaskawa';

export interface Coat {
  /** Exact except on metal finishes, which pull it toward their own tone. */
  color: string;
  finish: MaterialClass;
}

/** A zone of a mesh in its body's frame (m). */
export type Region =
  /** Triangles in the box: a straight cut across a surface. */
  | { box: [Vec3, Vec3] }
  /** Whole smooth surfaces lying in the box, so edges follow the CAD and never cut a face. */
  | { surfaces: [Vec3, Vec3] }
  /** The smooth surfaces at these points, for a part whose box would take its neighbours. */
  | { through: Vec3[] };

export interface PaintRule {
  /** Tested against the body name and the mesh name. */
  name?: RegExp;
  /** Position along the chain: the part no limb joint moves, or the last moving body of a limb. */
  at?: 'base' | 'tip';
  /** Paint only this zone of the claimed meshes, which one mesh can't otherwise part. */
  within?: Region;
  coat: Coat;
}

export interface PaintScheme {
  /** The main casting: every part no rule claims. */
  body: Coat;
  /** First match wins. */
  parts?: PaintRule[];
  /** Smoothing angle (radians), for a source mesh too coarse for the default. */
  crease?: number;
}

/** Keyed by robot id, or by maker for a scheme true of the whole range. */
export const PAINT: Record<string, PaintScheme> = {
  ...ABB,
  ...COBOTS,
  ...EPSON,
  ...FANUC,
  ...FIELD,
  ...HUMANOIDS,
  ...JAKA,
  ...KAWASAKI,
  ...KUKA,
  ...MITSUBISHI,
  ...QUADRUPEDS,
  ...UNITREE,
  ...UNIVERSAL,
  ...YASKAWA,
};
