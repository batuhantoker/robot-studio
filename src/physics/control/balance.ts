/**
 * What gains can't give a biped: a reaction to tipping. A network reads the body's tilt and spin and nudges the
 * leg targets, mirrored joints moving together, on top of the PID that still does the holding.
 */
import type { MjData } from '@mujoco/mujoco';
import { jointRole } from '../../core/control/gains';
import { type PolicyShape, policySize, runPolicy } from '../../core/control/learn/policy';
import { state } from '../runtime/arrays';
import type { StandTest } from './stand';

const LEG = /hip|knee|ankle|thigh|calf|shin|leg|foot/i;
const RIGHT = /(^|[_\-/ ])(right|r)([_\-/ ]|$)/i;
/** Sideways axes mirror across the body; pitch axes don't. */
const MIRRORED_AXIS = /roll|yaw/i;
/** Furthest a target moves from home (rad). */
const REACH = 0.3;
const CONTROL_SECONDS = 0.02;
const SPIN_SCALE = 0.3;

export class BalancePolicy {
  readonly shape: PolicyShape;
  readonly size: number;
  /** Physics steps between decisions. */
  readonly every: number;
  theta: number[];
  private readonly legs: { k: number; slot: number; sign: number }[];
  private readonly out: number[];

  constructor(private readonly stand: StandTest, names: string[], driven: boolean[], private readonly home: number[], dt: number) {
    const joints = names.flatMap((n, k) => (driven[k] && LEG.test(n) ? [k] : []));
    const roles = [...new Set(joints.map((k) => jointRole(names[k])))];
    this.legs = joints.map((k) => ({ k, slot: roles.indexOf(jointRole(names[k])), sign: RIGHT.test(names[k]) && MIRRORED_AXIS.test(names[k]) ? -1 : 1 }));
    this.shape = { inputs: 5, outputs: roles.length };
    this.size = policySize(this.shape);
    this.every = Math.max(1, Math.round(CONTROL_SECONDS / dt));
    this.theta = new Array<number>(this.size).fill(0);
    this.out = new Array<number>(roles.length).fill(0);
  }

  /** A robot with no legs to speak of has nothing here to learn with. */
  get usable(): boolean {
    return this.legs.length > 0;
  }

  /** Each decision: move the leg targets. */
  update(data: MjData, theta: ArrayLike<number>, target: Float64Array): void {
    const d = state(data), a = this.stand.rootAdr, v = this.stand.rootDof;
    const [w, x, y, z] = [d.qpos[a + 3], d.qpos[a + 4], d.qpos[a + 5], d.qpos[a + 6]];
    const obs = [2 * (x * z - w * y), 2 * (y * z + w * x), SPIN_SCALE * d.qvel[v + 3], SPIN_SCALE * d.qvel[v + 4], SPIN_SCALE * d.qvel[v + 5]];
    runPolicy(theta, this.shape, obs, this.out);
    for (const { k, slot, sign } of this.legs) target[k] = this.home[k] + REACH * sign * this.out[slot];
  }
}
