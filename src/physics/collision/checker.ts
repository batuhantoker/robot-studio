/**
 * Does a pose touch? MuJoCo's own collision pipeline on a private MjData, plus a floor test.
 * Pairs already touching at home are designed contacts (stator in rotor, tube in housing) and are ignored.
 */
import type { MjData } from '@mujoco/mujoco';
import type { Contact } from '../../core/collision/hull';
import type { ModelHandle } from '../model/handle';
import { lowestZ } from './floor';

export interface CheckerOptions {
  /** qpos address of each robot joint; `rest` fills everything else. */
  qposAdr: number[];
  rest: Float64Array;
  home: number[];
  label: (geom: number) => string;
  /** Geoms kept above the floor; null for robots that settle on it. */
  floor: { z: number; geoms: number[] } | null;
  /** Penetration tolerated before a pose counts as touching (m). */
  tol: number;
  /** False when the model has no collision geometry, so only the floor can stop it. */
  self: boolean;
}

const pairKey = (a: number, b: number) => (a < b ? a * 65536 + b : b * 65536 + a);

export class CollisionChecker {
  private readonly data: MjData;
  private readonly designed = new Set<number>();
  private readonly floorGeoms: number[];
  /** Off while the robot is shown other than its model stands (a hand bolted palm up to a wall has no floor below it). */
  floorTest = true;

  constructor(private readonly handle: ModelHandle, readonly opts: CheckerOptions, private readonly owned: boolean) {
    // An owned model is ours alone; a shared one (imported CAD) gets a private MjData beside the session's.
    this.data = owned ? handle.data : new handle.mj.MjData(handle.model);
    this.place(opts.home);
    this.eachContact((g1, g2) => void this.designed.add(pairKey(g1, g2)));
    const floor = opts.floor;
    this.floorGeoms = floor ? floor.geoms.filter((g) => this.low(g) >= floor.z - opts.tol) : [];
  }

  hit(q: number[]): Contact | null {
    this.place(q);
    let found: Contact | null = null;
    this.eachContact((g1, g2, dist) => {
      if (found || dist >= -this.opts.tol || this.designed.has(pairKey(g1, g2))) return;
      found = { a: this.opts.label(g1), b: this.opts.label(g2) };
    });
    if (found || !this.floorTest) return found;
    const z = this.opts.floor?.z ?? 0;
    const g = this.floorGeoms.find((geom) => this.low(geom) < z - this.opts.tol);
    return g === undefined ? null : { a: this.opts.label(g), b: 'floor' };
  }

  dispose(): void {
    if (this.owned) this.handle.dispose();
    else this.data.delete();
  }

  private low(g: number): number {
    return lowestZ(this.handle.model, this.data, g);
  }

  private place(q: number[]): void {
    const d = this.data as unknown as { qpos: Float64Array };
    d.qpos.set(this.opts.rest);
    this.opts.qposAdr.forEach((adr, k) => (d.qpos[adr] = q[k]));
    this.handle.mj.mj_kinematics(this.handle.model, this.data);
    this.handle.mj.mj_collision(this.handle.model, this.data);
  }

  private eachContact(fn: (g1: number, g2: number, dist: number) => void): void {
    if (!this.data.ncon) return;
    // `contact` and each get() are embind copies on the WASM heap; free them or every probe leaks.
    const all = this.data.contact;
    try {
      for (let i = 0; i < all.size(); i++) {
        const c = all.get(i);
        if (!c) continue;
        fn(c.geom1, c.geom2, c.dist);
        c.delete();
      }
    } finally {
      all.delete();
    }
  }
}
