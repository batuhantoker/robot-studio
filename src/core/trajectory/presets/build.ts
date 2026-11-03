/**
 * Trajectory presets: tool paths placed in the focused limb's workspace and solved into stops by IK,
 * each from the last so the arm flows, then checked for reach, flips and (when given) contact.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import { type Limb, type RobotJoint, limbQ } from '../../chain/limbs/types';
import { type Vec3, add, cross, normalize, scale, sub } from '../../math/linear/vec';
import { type LimbRole, limbRoles } from '../../motion/roles';
import { solveWholeBody } from '../../solvers/ik/multi';
import { type Plan, type StopOpts, compile } from '../plan';
import * as paths from './paths';

export interface PresetRobot {
  joints: RobotJoint[];
  limbs: Limb[];
}

export interface TrajectoryPreset {
  id: string;
  label: string;
  hint: string;
}

export interface BuiltPreset {
  plan: Required<Plan>;
  /** Scale it was fitted at (1 = full size). */
  size: number;
  /** Still touching something somewhere along the path (the playback guard will stop there). */
  touching: boolean;
}

type Surface = 'table' | 'any';
interface Task extends TrajectoryPreset {
  surface: Surface;
  path: (size: number) => paths.PathPoint[];
}

const TASKS: Task[] = [
  { id: 'pick', label: 'Pick & place', hint: 'Down, grip, carry over, down, release', surface: 'table', path: paths.pickAndPlace },
  { id: 'pallet', label: 'Palletize 2×2', hint: 'Four picks from one station onto a pallet', surface: 'table', path: paths.palletize },
  { id: 'square', label: 'Square', hint: 'Straight edges, stopping at the corners', surface: 'any', path: paths.square },
  { id: 'star', label: 'Star', hint: 'A pentagram in one stroke', surface: 'any', path: paths.star },
  { id: 'spiral', label: 'Spiral', hint: 'Three turns out, without stopping', surface: 'any', path: (s) => paths.spiral(s) },
  { id: 'eight', label: 'Figure 8', hint: 'Twice round a lemniscate', surface: 'any', path: paths.figureEight },
  { id: 'weave', label: 'Weld weave', hint: 'Woven seam with arc-strike and crater dwells', surface: 'any', path: (s) => paths.weave(s) },
  { id: 'raster', label: 'Raster scan', hint: 'Rows joined by half-turns, as in inspection', surface: 'any', path: (s) => paths.raster(s) },
  { id: 'helix', label: 'Helix', hint: 'Three rising turns', surface: 'table', path: (s) => paths.helix(s) },
];
const JOINT_TOUR: TrajectoryPreset = { id: 'tour', label: 'Joint tour', hint: 'Each joint of the limb to both sides in turn' };

const SIZES = [1, 0.75, 0.55, 0.4];
/** Nominal joint speeds (rad/s, m/s) that set how long a preset takes. */
const SPEED = { hinge: 0.8, slide: 0.25 };
const FLIP = 0.6;

const tipOf = (l: Limb, q: number[]): Vec3 => chainFrames(l.chain, limbQ(l, q)).tip.p;
const jump = (a: number[], b: number[]) => Math.max(0, ...a.map((v, k) => Math.abs(b[k] - v)));

export function trajectoryPresetsFor(robot: PresetRobot, focus: number, home: number[]): TrajectoryPreset[] {
  const limb = robot.limbs[focus];
  if (!limb?.chain.joints.length) return [];
  const role = limbRoles(robot, home)[focus]?.role;
  const tasks = limb.chain.joints.length >= 2 && role !== 'leg' ? TASKS : [];
  return [...tasks.map(({ id, label, hint }) => ({ id, label, hint })), JOINT_TOUR];
}

interface Frame {
  origin: Vec3;
  e: [Vec3, Vec3, Vec3];
}

/** Work surfaces to try: a board facing the robot, a table, and a wall beside it (planar arms), in front and where the tool is. */
function frames(r: LimbRole, surface: Surface): Frame[] {
  const d = sub(r.tip, r.base);
  const flat: Vec3 = [d[0], d[1], 0];
  const out = Math.hypot(flat[0], flat[1]) > 0.3 * Math.hypot(...d) ? normalize(flat) : ([1, 0, 0] as Vec3);
  const upward: Vec3 = [0, 0, 1];
  const side = cross(upward, out);
  const L = r.length;
  const reach = Math.hypot(...d);
  // A stretched limb is singular; work a little inside its reach.
  const work = reach > 0.85 * L ? add(r.base, scale(d, (0.7 * L) / reach)) : r.tip;
  const front = add(r.base, add(scale(out, 0.55 * L), scale(upward, 0.05 * L)));
  const board = (o: Vec3): Frame => ({ origin: o, e: [side, upward, scale(out, -1)] });
  const table = (o: Vec3): Frame => ({ origin: o, e: [side, out, upward] });
  const wall = (o: Vec3): Frame => ({ origin: o, e: [out, upward, side] });
  if (surface === 'table') return [table(front), table(work)];
  return [board(add(front, scale(upward, 0.15 * L))), table(front), board(work), table(work), wall(work), wall(front)];
}

const toWorld = (f: Frame, p: paths.P3, L: number): Vec3 =>
  add(f.origin, add(scale(f.e[0], p[0] * L), add(scale(f.e[1], p[1] * L), scale(f.e[2], p[2] * L))));

/** Stops for each point, every other limb's tool pinned; null when a point is out of reach or the arm flips. */
function solvePath(robot: PresetRobot, focus: number, home: number[], pts: { p: Vec3; via: boolean }[], tol: number): number[][] | null {
  const pins = robot.limbs.map((l) => tipOf(l, home));
  const out: number[][] = [];
  let q = home;
  for (let k = 0; k < pts.length; k++) {
    const targets = robot.limbs.map((_, j) => ({ limb: j, point: j === focus ? pts[k].p : pins[j] }));
    let r = solveWholeBody(robot.limbs, robot.joints, targets, q, { restarts: 0, maxIter: 120, tol: 1e-6 });
    if (k === 0 && r.residual > tol) r = solveWholeBody(robot.limbs, robot.joints, targets, q, { restarts: 6, seed: 1, maxIter: 200, tol: 1e-6 });
    if (r.residual > tol) return null;
    if (k > 0 && pts[k].via && pts[k - 1].via && jump(q, r.q) > FLIP) return null;
    q = r.q;
    out.push(q);
  }
  return out;
}

/** Long enough that the busiest joint of each move peaks near its nominal speed (× `brisk`); holds on top. */
function durationOf(joints: RobotJoint[], waypoints: number[][], opts: StopOpts[], brisk = 1): number {
  const speed = joints.map((j) => brisk * (j.type === 'slide' ? SPEED.slide : SPEED.hinge));
  const rest = (i: number) => (opts[i]?.via ? 0 : 1);
  const moving = waypoints.slice(1).reduce((s, q, i) =>
    s + Math.max(...q.map((v, k) => Math.abs(v - waypoints[i][k]) / speed[k])) * (1 + 0.4375 * (rest(i) + rest(i + 1))), 0);
  const held = opts.reduce((s, o) => s + (o.hold ?? 0), 0);
  return Math.min(Math.max(moving + held, 3), 120);
}

function touches(plan: Plan, hit: (q: number[]) => boolean): boolean {
  const c = compile(plan);
  const n = 120 + 2 * plan.waypoints.length;
  return plan.waypoints.some(hit) || Array.from({ length: n + 1 }, (_, i) => c.at((plan.duration * i) / n).q).some(hit);
}

function taskPlan(robot: PresetRobot, focus: number, home: number[], task: Task, hit?: (q: number[]) => boolean): BuiltPreset | null {
  const role = limbRoles(robot, home)[focus];
  const L = role.length;
  const tol = Math.max(1.5e-3, 4e-3 * L);
  let fallback: BuiltPreset | null = null;
  // A drawing a limb can't lift off its surface (a planar arm) is drawn with the pen kept down.
  const variants = task.surface === 'any' ? [false, true] : [false];
  for (const flat of variants) for (const size of SIZES) {
    for (const f of frames(role, task.surface)) {
      const pts = task.path(size).filter((p) => !flat || p.p[2] === 0);
      const qs = solvePath(robot, focus, home, pts.map((p) => ({ p: toWorld(f, p.p, L), via: p.via })), tol);
      if (!qs) continue;
      const waypoints = [home, ...qs, home];
      const opts: StopOpts[] = [{}, ...pts.map((p) => (p.via ? { via: true } : p.hold ? { hold: p.hold } : {})), {}];
      const plan: Required<Plan> = { waypoints, opts, pace: 'distance', duration: durationOf(robot.joints, waypoints, opts) };
      if (!hit || !touches(plan, hit)) return { plan, size, touching: false };
      fallback ??= { plan, size, touching: true };
    }
  }
  return fallback;
}

/** Each joint of the focused limb out to both sides and back, as far as it swings clear on its own. */
function jointTour(robot: PresetRobot, focus: number, home: number[], hit?: (q: number[]) => boolean): BuiltPreset {
  const waypoints = [home];
  const opts: StopOpts[] = [{}];
  for (const j of robot.limbs[focus].index) {
    const { limits: [lo, hi], continuous, type } = robot.joints[j];
    const cap = type === 'slide' ? 0.3 * (hi - lo) : Math.min(0.3 * (hi - lo), 1.2);
    const swing = (dir: 1 | -1) => {
      const room = continuous ? 1.2 : dir > 0 ? hi - home[j] : home[j] - lo;
      let a = Math.min(continuous ? 1.2 : cap, Math.max(room - 1e-3, 0));
      // Back off until the swing out from home is clear all the way.
      for (let k = 0; k < 6 && hit; k++) {
        const clear = Array.from({ length: 12 }, (_, i) => home.map((v, m) => (m === j ? v + (dir * a * (i + 1)) / 12 : v))).every((q) => !hit(q));
        if (clear) break;
        a *= 0.6;
      }
      return home.map((v, m) => (m === j ? v + dir * a : v));
    };
    const plus = swing(1), minus = swing(-1);
    if (jump(plus, home) < 1e-3 && jump(minus, home) < 1e-3) continue;
    waypoints.push(plus, minus, home);
    opts.push({ hold: 0.25 }, { hold: 0.25 }, {});
  }
  if (waypoints.length < 2) waypoints.push(home), opts.push({});
  const plan: Required<Plan> = { waypoints, opts, pace: 'distance', duration: durationOf(robot.joints, waypoints, opts, 2) };
  return { plan, size: 1, touching: !!hit && touches(plan, hit) };
}

/** Solve preset `id` for the focused limb from `home`; null if no size or surface fits the robot. */
export function buildTrajectoryPreset(id: string, robot: PresetRobot, focus: number, home: number[], hit?: (q: number[]) => boolean): BuiltPreset | null {
  if (id === JOINT_TOUR.id) return jointTour(robot, focus, home, hit);
  const task = TASKS.find((t) => t.id === id);
  return task ? taskPlan(robot, focus, home, task, hit) : null;
}
