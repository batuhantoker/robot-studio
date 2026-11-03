/**
 * Driving a robot from a velocity command, within what its legs or wheels can do: a stepping gait whose
 * stance feet stay put on the ground while the body moves, and wheels that roll and steer (Ackermann).
 * Everything is in the robot's own frame; the world moves under it.
 */
import { type Vec3, cross, dot } from '../math/linear/vec';

const TAU = 2 * Math.PI;
const UP: Vec3 = [0, 0, 1];

/** Body velocity: along the robot's forward and left axes (m/s), and yaw rate (rad/s, CCW). */
export interface Command {
  forward: number;
  lateral: number;
  turn: number;
}

export const STILL: Command = { forward: 0, lateral: 0, turn: 0 };

/** Velocity of the ground under point `p`, as the body sees it: a stance foot must move with it. */
export function groundVelocity(c: Command, forward: Vec3, p: Vec3): Vec3 {
  const left = cross(UP, forward);
  const v: Vec3 = [forward[0] * c.forward + left[0] * c.lateral, forward[1] * c.forward + left[1] * c.lateral, 0];
  const spin = cross([0, 0, c.turn], [p[0], p[1], 0]);
  return [-(v[0] + spin[0]), -(v[1] + spin[1]), 0];
}

/** The base pose in the world after `dt` of a command, for the world shift. */
export function advanceBase(pose: { x: number; y: number; yaw: number }, c: Command, forward: Vec3, dt: number) {
  const heading = Math.atan2(forward[1], forward[0]) + pose.yaw;
  const yaw = pose.yaw + c.turn * dt;
  const mid = heading + 0.5 * c.turn * dt;
  return {
    x: pose.x + (Math.cos(mid) * c.forward - Math.sin(mid) * c.lateral) * dt,
    y: pose.y + (Math.sin(mid) * c.forward + Math.cos(mid) * c.lateral) * dt,
    yaw,
  };
}

export interface GaitLeg {
  /** Foot rest point in the robot frame (on the ground). */
  home: Vec3;
  /** Cycle offset: legs half a cycle apart alternate. */
  offset: number;
}

export interface GaitSpec {
  legs: GaitLeg[];
  /** Seconds per full cycle; each foot swings for half of it. */
  period: number;
  lift: number;
  /** Longest stance slide a foot may make (m). */
  stride: number;
  forward: Vec3;
}

/** How fast these legs can carry the body: a full stride per stance (half a cycle). */
export const gaitTopSpeed = (g: GaitSpec) => (2 * g.stride) / g.period;

/** The largest yaw rate whose stance slide stays within a stride at the farthest foot. */
export function gaitTopTurn(g: GaitSpec): number {
  const r = Math.max(...g.legs.map((l) => Math.hypot(l.home[0], l.home[1])), 1e-3);
  return Math.min(1.4, (2 * g.stride) / (g.period * r));
}

/** Scale a command down until every foot's stance slide fits in a stride. */
export function fitCommand(g: GaitSpec, c: Command): Command {
  const slide = Math.max(...g.legs.map((l) => Math.hypot(...groundVelocity(c, g.forward, l.home)) * (g.period / 2)));
  const k = slide > g.stride ? g.stride / slide : 1;
  return { forward: c.forward * k, lateral: c.lateral * k, turn: c.turn * k };
}

/**
 * Feet driven by integration: in stance a foot moves exactly with the ground under it (no skating at any
 * speed or turn), in swing it travels from where it lifted to half a slide ahead of home, arriving with
 * the stance velocity so touchdown is smooth. Idle legs finish their swing and stop at a half-cycle.
 */
export class Stepper {
  feet: Vec3[];
  phase = 0;
  walking = false;
  private lifted: Vec3[];

  constructor(readonly g: GaitSpec) {
    this.feet = g.legs.map((l) => [...l.home]);
    this.lifted = g.legs.map((l) => [...l.home]);
  }

  private swinging = (i: number, phase = this.phase) => ((phase + this.g.legs[i].offset) % 1 + 1) % 1 < 0.5;

  step(c: Command, dt: number): Vec3[] {
    const { g } = this;
    const moving = Math.abs(c.forward) + Math.abs(c.lateral) > 1e-3 || Math.abs(c.turn) > 1e-3;
    const home = g.legs.every((l, i) => Math.hypot(this.feet[i][0] - l.home[0], this.feet[i][1] - l.home[1]) < 1e-3);
    if (!moving && home && !this.walking) return this.feet.map((f) => [...f]);
    let next = this.phase + dt / g.period;
    // Stop on a half-cycle boundary, where every foot is down, once nothing is asked and the feet are home.
    if (!moving && home && Math.floor(next * 2) !== Math.floor(this.phase * 2)) {
      next = Math.floor(next * 2) / 2;
      this.walking = false;
    } else this.walking = true;
    g.legs.forEach((l, i) => {
      const was = this.swinging(i), now = this.swinging(i, next);
      if (!was && now) this.lifted[i] = [...this.feet[i]];
      const u = ((next + l.offset) % 1 + 1) % 1;
      const vel = groundVelocity(c, g.forward, l.home);
      if (!now) {
        if (was) this.feet[i] = this.touchdown(i, c);
        const f = this.feet[i], v = groundVelocity(c, g.forward, f);
        this.feet[i] = [f[0] + v[0] * dt, f[1] + v[1] * dt, l.home[2]];
        return;
      }
      const s = u / 0.5;
      const land = this.touchdown(i, c), from = this.lifted[i];
      // Position along the swing with end slopes equal to the stance slide, so the foot meets the ground moving with it.
      const end = [vel[0] * (g.period / 2), vel[1] * (g.period / 2)];
      const xy = [0, 1].map((k) => {
        const span = land[k] - from[k];
        return from[k] + span * s - (span - end[k]) * Math.sin(TAU * s) / TAU;
      });
      // A foot with nowhere to go stays down: no marching on the spot while the gait winds down.
      const lift = g.lift * Math.min(1, Math.hypot(land[0] - from[0], land[1] - from[1]) / (0.25 * g.stride));
      this.feet[i] = [xy[0], xy[1], l.home[2] + lift * Math.sin(Math.PI * s) ** 2];
    });
    this.phase = next;
    return this.feet.map((f) => [...f]);
  }

  /** Half a stance slide ahead of home, so the stance centres on it. */
  private touchdown(i: number, c: Command): Vec3 {
    const l = this.g.legs[i], v = groundVelocity(c, this.g.forward, l.home), h = this.g.period / 4;
    return [l.home[0] - v[0] * h, l.home[1] - v[1] * h, l.home[2]];
  }
}

export interface Wheel {
  /** Whole-robot index of the spinning joint, and the sign that rolls it forward. */
  spin: number;
  spinSign: number;
  /** Steering hinge (about vertical), if the wheel steers. */
  steer: number | null;
  steerSign: number;
  /** Contact point in the robot frame, and rolling radius. */
  at: Vec3;
  radius: number;
}

/** Point the turn rotates about: the axle of the wheels that do not steer, else the middle of all wheels. */
function pivot(wheels: Wheel[], forward: Vec3): number {
  const fixed = wheels.filter((w) => w.steer === null);
  const set = fixed.length && fixed.length < wheels.length ? fixed : wheels;
  return set.reduce((s, w) => s + dot(w.at, forward), 0) / set.length;
}

export interface WheelState {
  /** Steering angle per wheel (rad, CCW), and rolling rate (rad/s) per wheel. */
  steer: number[];
  rate: number[];
}

/**
 * Wheel angles and rates for speed `v` and either a curvature (steered robots: every wheel's heading is
 * tangent to its circle about the turn centre) or a yaw rate (skid and differential drive, wheels straight).
 */
export function wheelState(wheels: Wheel[], forward: Vec3, v: number, curvature: number, yawRate: number): WheelState {
  const left = cross(UP, forward), x0 = pivot(wheels, forward);
  const steered = wheels.some((w) => w.steer !== null);
  const cx = wheels.reduce((s, w) => s + dot(w.at, left), 0) / wheels.length;
  return wheels.reduce<WheelState>((o, w) => {
    const a = dot(w.at, forward) - x0, b = dot(w.at, left) - cx;
    if (steered) {
      const k = curvature, side = 1 - b * k;
      o.steer.push(w.steer === null ? 0 : Math.atan((a * k) / side));
      o.rate.push((v * Math.sign(side || 1) * Math.hypot(a * k, side)) / w.radius);
    } else {
      o.steer.push(0);
      o.rate.push((v - yawRate * b) / w.radius);
    }
    return o;
  }, { steer: [], rate: [] });
}

/** The tightest curvature whose steering angles all stay within `maxSteer`. */
export function maxCurvature(wheels: Wheel[], forward: Vec3, maxSteer: number): number {
  if (!wheels.some((w) => w.steer !== null)) return 0;
  let lo = 0, hi = 20;
  for (let i = 0; i < 40; i++) {
    const k = (lo + hi) / 2;
    const worst = Math.max(...[k, -k].flatMap((c) => wheelState(wheels, forward, 0, c, 0).steer.map(Math.abs)));
    if (worst <= maxSteer && Number.isFinite(worst)) lo = k;
    else hi = k;
  }
  return lo;
}
