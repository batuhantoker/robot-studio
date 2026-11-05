/**
 * A body that stands on its feet. Feet are planned in the world: planted ones stay exactly where they are and
 * swinging ones follow their arc. The zero-moment point stays under the feet on the ground and the centre of mass
 * rides it as an inverted pendulum; at every sample the body is placed so the whole robot's centre of mass sits on
 * that path, and the legs reach their feet from there. The clip carries the body as well as the joints.
 */
import { chainFrames } from '../../chain/kinematics/frames';
import { enforceLimits } from '../../chain/limbs/limits';
import { limbQ } from '../../chain/limbs/types';
import { matMul, matVec, rodrigues } from '../../math/linear/mat3';
import { type Transform, applyTransform, compose, invert } from '../../math/linear/transform';
import { type Vec3, add, dot, norm, scale, sub } from '../../math/linear/vec';
import type { P2 } from '../../math/planar/hull';
import type { Body } from '../body';
import { leadSpline } from '../interpolate';
import type { Footing, MotionClip, MotionRobot } from '../types';
import { armSwings, waistTurn } from './arms';
import { pendulumLine, pendulumPath, smoothPath, zmpOf } from './balance';
import { type Foot, type FootArc, type LegShape, ease, kneeFlex, kneesBent, legShape, plantedFoot, swingPose } from './foot';
import { reachPoint, reachPose, rotationError } from './limb-pose';
import { massModel, massPoints } from './mass';
import { centroid, margin, supportPolygon } from './support';

/** A planted motion by cycle phase: its shares of `bob` and `bow`, weight moved toward the left foot (m), a lean that way (rad), and the arms, from hanging. */
export interface Script {
  sink(s: number): number;
  bend(s: number): number;
  weight?(s: number): number;
  lean?(s: number): number;
  arms?(s: number, q: number[]): void;
}

export interface Gait extends FootArc {
  period: number;
  /** Seconds of easing in from the starting pose. */
  lead: number;
  /** Cycle phase at which each leg lifts, in `body.parts` leg order, and the share of the cycle a foot spends in the air. */
  lifts: number[];
  air: number;
  /** Feet stand this far either side of the middle once stepped in (m), and the ZMP reaches this share of half a foot outboard of their centre mid-flight. */
  stance: number;
  outward: number;
  /** Knee flexion at mid-stance (rad), which sets how tall the body stands, and how far it sinks at each foot strike (m). */
  knee: number;
  dip: number;
  /** Hips turn toward the rising knee and shoulders against it, and the swing hip hikes as the trunk leans over the standing foot (rad). */
  hipTurn: number;
  shoulderTurn: number;
  hipRoll: number;
  /** Trunk pitched this far forward (rad), and the share of the fore-aft balance it takes so the pelvis can hold still. */
  lean: number;
  trunkShare: number;
  /** The shoulder-to-hand line swings this far forward and back of straight down (rad). */
  armForward: number;
  armBack: number;
  /** Hand held at this share of full stretch from the shoulder, a little closer at the front of the swing. */
  handShare: number;
  handFold: number;
  /** Arms carried this far out from the side, clear of the hips, and turned this far so the forearm points past the thigh (rad). */
  armOut: number;
  armTwist: number;
  /** How far below its starting height the body rides, as a share of the leg's height; a biped straightens up from there. */
  crouch?: number;
  /** With no foot lifting: how far the body sinks and rises once a cycle (m), the trunk bowing this far at the bottom (rad) and the arms coming up together. */
  bob?: number;
  bow?: number;
  /** With no foot lifting: the motion's own timing, in place of an even sink and rise. */
  script?: Script;
}

/** A clip that knows how close its ZMP comes to the edge of the support (m; negative is outside). */
export interface SteppingClip extends MotionClip {
  balance: number;
}

const SAMPLES = 96;
/** Moments per cycle the finished clip's balance is measured at. */
const CHECK = 240;
/** A sole point this close to the floor (m) counts as on it. */
const TOUCH = 2e-3;
const UP: Vec3 = [0, 0, 1];
const TAU = 2 * Math.PI;
/** Room a leg joint keeps from its limit (rad). */
const STOP = 0.04;
/** A leg further than this from its foot (m) cannot reach it: give up on the attempt at once. */
const MISSED = 5e-3;
/** A foot in the air may miss its path by this much (m): only a planted foot has to be exact. */
const AIR_SLACK = 0.03;
/** Size of the first step, as a share of the rest. */
const FIRST = 0.6;
/** Passes of measuring the whole robot's ZMP and correcting the centre of mass for what the pendulum left out. */
const REFINE = 6;
/** Where the ZMP starts and ends a flight along the standing foot, in half foot lengths from its centre. */
const ROLL_FROM = -0.2;
const ROLL_TO = 0.45;
/** Where the ZMP meets a foot and leaves it, in half foot widths outboard of its centre. */
const INBOARD = -0.3;
/** Harmonics of the cycle kept in the body's final path. */
const SMOOTH = 12;

const wrap = (s: number) => ((s % 1) + 1) % 1;

function bodyFrame(centre: Vec3, c: number[]): Transform {
  const R = matMul(rodrigues(UP, c[5]), matMul(rodrigues([0, 1, 0], c[4]), rodrigues([1, 0, 0], c[3])));
  return { R, p: add(add(centre, [c[0], c[1], c[2]]), scale(matVec(R, centre), -1)) };
}

function blend(a: Transform, b: Transform, k: number): Transform {
  const turn = rotationError(b.R, a.R), angle = norm(turn);
  const R = angle > 1e-9 ? matMul(rodrigues(scale(turn, 1 / angle), angle * k), a.R) : a.R;
  return { R, p: add(scale(a.p, 1 - k), scale(b.p, k)) };
}

function periodicBlur(values: number[], sigma: number): number[] {
  const n = values.length, reach = Math.ceil(4 * sigma);
  const w = Array.from({ length: 2 * reach + 1 }, (_, i) => Math.exp(-0.5 * ((i - reach) / sigma) ** 2));
  const total = w.reduce((a, b) => a + b, 0);
  return values.map((_, k) => w.reduce((s, v, i) => s + v * values[(((k + i - reach) % n) + n) % n], 0) / total);
}

const soleOnFloor = (f: Foot): P2[] => f.sole.map((p) => {
  const w = applyTransform(f.rest, p);
  return [w[0], w[1]];
});

/** How far the ZMP may stray from its plan along and across the foot (m) before the centre of mass is moved for it. */
const BAND = [0.02, 0.004];
/** The same with point feet, whose support is a thin line: there is no along. */
const BAND_POINT = [0.004, 0.004];
/** Legs with fewer joints than this cannot set a foot flat: they place a point. */
const ANKLED = 5;
/** Share of the cycle a foot is off the floor, and the phase it leaves it. */
const flightOf = (g: Gait) => g.air * (1 - g.peel);
/** The last of a flight the foot is all but down, when the ZMP can start across to it. */
const SETTLING = 0.1;
const toeOff = (g: Gait, lift: number) => lift + g.air * g.peel;

/**
 * Under the feet that stand through each flight, rolling from behind their centre toward the toes as a foot does,
 * and straight across to the next feet while all are touching.
 */
function zmpPlan(feet: Foot[], g: Gait, forward: Vec3, left: Vec3, n: number): P2[] {
  if (!g.air) return new Array<P2>(n).fill(centroid(supportPolygon(feet.flatMap(soleOnFloor))));
  const flight = flightOf(g) * (1 - SETTLING);
  const standing = (s: number) => feet.filter((_, i) => wrap(s - toeOff(g, g.lifts[i])) >= flight);
  const swings = [...new Set(g.lifts.map((l) => wrap(toeOff(g, l))))].sort((a, b) => a - b);
  const reach = 0.5 * Math.max(...feet.map((f) => {
    const along = soleOnFloor(f).map((p) => p[0] * forward[0] + p[1] * forward[1]);
    return Math.max(...along) - Math.min(...along);
  }));
  const wide = 0.5 * Math.max(...feet.map((f) => {
    const across = soleOnFloor(f).map((p) => p[0] * left[0] + p[1] * left[1]);
    return Math.max(...across) - Math.min(...across);
  }));
  const middle = centroid(supportPolygon(feet.flatMap(soleOnFloor)));
  const roll = (at: P2, k: number, out: number): P2 => {
    if (feet.length > 2) return at;
    const side = out * wide * Math.sign((at[0] - middle[0]) * left[0] + (at[1] - middle[1]) * left[1]);
    return [at[0] + forward[0] * k * reach + left[0] * side, at[1] + forward[1] * k * reach + left[1] * side];
  };
  const under = (s: number, k = 0, out = INBOARD) => roll(centroid(supportPolygon(standing(s).flatMap(soleOnFloor))), k, out);
  return Array.from({ length: n }, (_, k) => {
    const s = k / n;
    if (standing(s).length < feet.length) {
      const landed = swings.reduce((p, c) => (wrap(s - c) < wrap(s - p) ? c : p));
      const along = wrap(s - landed) / flight;
      // Across the foot and back within each flight, so the body rounds over instead of parking above it.
      return under(s, ROLL_FROM + (ROLL_TO - ROLL_FROM) * along, INBOARD + (g.outward - INBOARD) * Math.sin(Math.PI * along));
    }
    const since = (from: number) => wrap(s - from), until = (to: number) => wrap(to - s);
    const ended = swings.map((l) => l + flight).reduce((p, c) => (since(c) < since(p) ? c : p));
    const coming = swings.reduce((p, c) => (until(c) < until(p) ? c : p));
    const x = since(ended) / Math.max(since(ended) + until(coming), 1e-9);
    const [a, b] = [under(ended - 0.5 * flight, ROLL_TO), under(coming + 0.5 * flight, ROLL_FROM)];
    return [a[0] + (b[0] - a[0]) * x, a[1] + (b[1] - a[1]) * x];
  });
}

export function steppingClip(robot: MotionRobot, q0: number[], footing: Footing, body: Body, gait: Gait): SteppingClip | null {
  const legs = body.parts.filter((p) => p.kind === 'leg');
  if (!legs.length || legs.length !== gait.lifts.length || legs.some((p) => !footing.feet.has(p.limb))) return null;
  const n = q0.length, dt = gait.period / SAMPLES;
  const com = massModel(robot), points = massPoints(robot);
  // Arms swing against a pair of legs; on four or more they just stay as they are.
  const arms = legs.length === 2 ? armSwings(robot, q0, body) : [], waist = waistTurn(robot, q0, arms);
  const wide = legs.map((p) => plantedFoot(robot, q0, p.limb, footing.feet.get(p.limb)!, footing.floor, body.forward));
  const tips = legs.map((p) => chainFrames(robot.limbs[p.limb].chain, limbQ(robot.limbs[p.limb], q0)).tip);
  const shapes = legs.map((p) => legShape(robot, q0, p.limb, body.left));
  const bases = legs.map((p) => p.role.base);
  const centre = scale(bases.reduce(add, [0, 0, 0] as Vec3), 1 / bases.length);
  // Where the feet march: stepped in under the hips from however wide the robot stood.
  const feet = wide.map((f) => {
    const off = dot(sub(f.rest.p, centre), body.left);
    const by = -Math.sign(off) * Math.max(Math.abs(off) - gait.stance, 0);
    return { ...f, rest: { R: f.rest.R, p: add(f.rest.p, scale(body.left, by)) } };
  });
  // A foot off the floor at the start (a posed robot) stands the body on the lowest one.
  const settle = Math.max(...wide.map((f, i) => f.rest.p[2] - tips[i].p[2]));
  const gravity = norm(robot.limbs[legs[0].limb].chain.gravity) || 9.81;
  const pull = gravity / Math.max(com(q0)[2] - footing.floor, 1e-3);
  const flight = flightOf(gait);
  const swingMid = gait.lifts.map((l) => toeOff(gait, l) + flight / 2);
  const leftLeg = legs.findIndex((p) => p.side === 'left');
  const opposite = (side: string) => legs.findIndex((p) => p.side !== side && p.side !== 'centre');

  const script = gait.script;
  const zmp = zmpPlan(feet, gait, body.forward, body.left, SAMPLES).map((p, k): P2 => {
    const w = script?.weight?.(k / SAMPLES) ?? 0;
    return [p[0] + body.left[0] * w, p[1] + body.left[1] * w];
  });
  const weight = [0, 1].map((a) => pendulumPath(zmp.map((p) => p[a]), gait.period, pull));
  const footAt = (i: number, s: number): Transform => {
    const u = wrap(s - gait.lifts[i]);
    return u < gait.air ? swingPose(feet[i], u / gait.air, gait, body.forward) : feet[i].rest;
  };
  const inAir = (i: number, s: number) => {
    const u = wrap(s - gait.lifts[i]);
    return u < gait.air && u > gait.air * gait.peel;
  };
  // Hips turn with the rising knee, one way per leg; a body with no left leg stays square.
  const turn = (s: number) => (leftLeg < 0 || legs.length !== 2 ? 0 : Math.cos(TAU * (s - swingMid[leftLeg])));
  const elbows = arms.map((a) => [a.foldTo(gait.handShare), a.foldTo(gait.handShare - gait.handFold)]);
  const hangs = arms.map((a, i) => a.hang(elbows[i][0]));
  // Planned inside the joint's range: a swing clipped at playback kinks, and accelerations turn a kink into a ZMP spike.
  const swings = arms.map((a, i) => {
    const [lo, hi] = robot.joints[a.swing].limits, room = (v: number) => Math.max(a.sense * (v - hangs[i]) - STOP, 0);
    return [Math.min(gait.armForward, room(a.sense > 0 ? hi : lo)), Math.min(gait.armBack, Math.max(-a.sense * ((a.sense > 0 ? lo : hi) - hangs[i]) - STOP, 0))];
  });
  const sunk = script?.sink ?? ((s: number) => (gait.bob ? 0.5 - 0.5 * Math.cos(TAU * s) : 0));
  const bowed = (s: number) => gait.lean + (gait.bow ?? 0) * (script?.bend ?? sunk)(s);
  const upper = (s: number, q: number[]) => {
    arms.forEach((a, i) => {
      const leg = opposite(a.part.side);
      if (leg < 0) return;
      const w = gait.bob ? 2 * sunk(s) - 1 : Math.cos(TAU * (s - swingMid[leg])), [fore, back] = swings[i];
      q[a.swing] = hangs[i] + a.sense * (0.5 * (fore - back) + 0.5 * (fore + back) * w);
      if (a.elbow !== null) q[a.elbow] = elbows[i][0] + (elbows[i][1] - elbows[i][0]) * Math.max(0, w);
      if (a.out !== null) q[a.out] = a.down + a.outSense * gait.armOut;
      if (a.twist !== null) q[a.twist] = q0[a.twist] + a.twistSense * gait.armTwist;
    });
    if (waist) q[waist.joint] = q0[waist.joint] + waist.sense * (gait.hipTurn + gait.shoulderTurn) * turn(s);
    script?.arms?.(s, q);
  };
  const rise = periodicBlur(Array.from({ length: SAMPLES }, (_, k) => Math.max(0, ...gait.lifts.map((l) => {
    const u = wrap(k / SAMPLES - toeOff(gait, l));
    return u < flight ? Math.sin((Math.PI * u) / flight) ** 2 : 0;
  }))), SAMPLES * 0.02);

  // A model rooted above the waist runs both legs through it: that is trunk, which no one leg may turn for its own foot.
  const trunkJoints = new Set([...robot.limbs[legs[0].limb].index.filter((j) => legs.every((p) => robot.limbs[p.limb].index.includes(j))), ...legs.flatMap((p) => footing.feet.get(p.limb)!.past ?? [])]);
  const contacts = legs.map((p, i) => {
    if (robot.limbs[p.limb].index.length >= ANKLED) return null;
    const { sole } = feet[i];
    return scale(sole.reduce(add, [0, 0, 0] as Vec3), 1 / sole.length);
  });
  const planar = legs.some((p) => robot.limbs[p.limb].index.length < 3);
  /** One leg to its foot, with the body at `inv`: the whole pose if it has the joints, its contact point if not. */
  const reach = (i: number, inv: Transform, target: Transform, q: number[], up: boolean) => {
    const limb = robot.limbs[legs[i].limb], at = compose(inv, target), point = contacts[i];
    return point ? reachPoint(limb, robot.joints, applyTransform(at, point), point, q, trunkJoints) : reachPose(limb, robot.joints, at, q, up, trunkJoints);
  };
  /** Legs to their feet, the body moved until the weight is on `want`; `c` and `q` come back solved. */
  const stand = (targets: Transform[], c: number[], want: P2, q: number[], up: boolean[]): number => {
    let left = 0;
    for (let pass = 0; pass < 8; pass++) {
      const T = bodyFrame(centre, c), inv = invert(T);
      left = Math.max(...legs.map((_, i) => {
        const miss = reach(i, inv, targets[i], q, up[i]);
        return up[i] ? Math.max(miss - AIR_SLACK, 0) : miss;
      }));
      if (left > MISSED && pass >= 2) return left;
      const w = applyTransform(T, com(q));
      // Legs that only swing fore and aft cannot carry a body sideways.
      const [ex, ey] = [want[0] - w[0], planar ? 0 : want[1] - w[1]];
      if (Math.hypot(ex, ey) < 3e-5 || pass === 7) break;
      c[0] += ex;
      c[1] += ey;
    }
    return left;
  };

  const ready = kneesBent(robot, q0, legs.map((p, i) => ({ limb: p.limb, shape: shapes[i] })), body.forward, trunkJoints);
  /** What the legs add to the body's height so that the whole robot rises and falls smoothly, not in jerks with each knee. */
  const lift = new Array<number>(SAMPLES).fill(0);
  const solveLoop = (top: number, from: number[][] | null): { rows: number[][]; worst: number } => {
    const q = from ? from[0].slice(0, n) : [...ready], c = from ? from[0].slice(n) : [0, 0, top, 0, gait.lean, 0];
    const rows: number[][] = [];
    let worst = 0;
    for (let k = 0; k < SAMPLES; k++) {
      const s = k / SAMPLES;
      upper(s, q);
      c[2] = top - gait.dip * (1 - rise[k]) + lift[k] - (gait.bob ?? 0) * sunk(s);
      c[3] = gait.hipRoll * turn(s) - body.forward[0] * (script?.lean?.(s) ?? 0);
      c[4] = bowed(s);
      c[5] = -gait.hipTurn * turn(s);
      worst = Math.max(worst, stand(feet.map((_, i) => footAt(i, s)), c, [weight[0][k], weight[1][k]], q, legs.map((_, i) => inAir(i, s))));
      if (worst > MISSED) break;
      rows.push([...q, ...c]);
    }
    return { rows, worst };
  };
  const pinched = (rows: number[][]) => legs.some((p) => robot.limbs[p.limb].index.some((i) => {
    const [lo, hi] = robot.joints[i].limits;
    return rows.some((r) => r[i] - lo < STOP || hi - r[i] < STOP);
  }));

  const legLength = centre[2] - footing.floor, band = contacts.some(Boolean) ? BAND_POINT : BAND;
  let top = -(gait.crouch ?? 0.05) * legLength, solved = solveLoop(top, null);
  if (solved.worst > MISSED) return null;
  const refine = (passes: number) => {
    for (let pass = 0; pass < passes; pass++) {
      const measured = zmpOf(solved.rows.map((r) => {
        const T = bodyFrame(centre, r.slice(n));
        return points(r.slice(0, n)).map((b) => ({ m: b.m, p: applyTransform(T, b.p) }));
      }), dt, gravity, footing.floor);
      const kept = [...weight.map((w) => [...w]), [...lift]];
      [0, 1].forEach((a) => {
        // Inside a band the ZMP may wander: chasing it exactly would pump the pelvis for no gain in balance.
        const off = zmp.map((p, k) => {
          const e = p[a] - measured[k][a];
          return Math.sign(e) * Math.max(Math.abs(e) - band[a], 0);
        });
        const fix = pendulumPath(off, gait.period, pull);
        weight[a] = weight[a].map((v, k) => v + 0.8 * fix[k]);
      });
      const height = solved.rows.map((r) => applyTransform(bodyFrame(centre, r.slice(n)), com(r.slice(0, n)))[2]);
      const steady = smoothPath(height, script ? SMOOTH : 2 * legs.length);
      height.forEach((v, k) => (lift[k] += 0.8 * (steady[k] - v)));
          const next = solveLoop(top, solved.rows);
      if (next.rows.length < SAMPLES) {
        [weight[0], weight[1]] = kept;
        lift.splice(0, SAMPLES, ...kept[2]);
        return;
      }
      solved = next;
    }
  };
  // Up from a safe crouch until the standing knee reaches its mark, short of the stop where a foot would slide.
  const shaped = legs.findIndex((_, i) => shapes[i]);
  const straighten = () => {
    if (shaped < 0) return;
    const limb = legs[shaped].limb, shape = shapes[shaped] as LegShape;
    const mid = Math.round(wrap(swingMid[(shaped + 1) % legs.length]) * SAMPLES) % SAMPLES;
    let limit = 0.03;
    for (let i = 0; i < 8; i++) {
      const flex = kneeFlex(robot, solved.rows[mid].slice(0, n), limb, shape);
      if (Math.abs(flex - gait.knee) < 0.02) return;
      // Near straight a leg's length goes as thigh · shin / length · flex²/2.
      const want = 0.5 * (flex * flex - gait.knee * gait.knee) * shape.thigh * shape.shin / (shape.thigh + shape.shin);
      const step = Math.min(Math.max(want, -limit), limit);
      const next = solveLoop(top + step, solved.rows);
      if (next.worst > 1e-3 || next.rows.length < SAMPLES || pinched(next.rows)) limit /= 2;
      else {
        top += step;
        solved = next;
      }
    }
  };
  refine(REFINE);
  straighten();
  refine(2);
  if (solved.rows.length < SAMPLES || solved.worst > MISSED) return null;
  // The body carries the solver's tolerance as noise, which accelerations multiply: smooth it and let the legs follow exactly.
  const sway = [0, 1].map((a) => smoothPath(solved.rows.map((r) => r[n + a]), SMOOTH));
  const fore = sway[0].reduce((x, y) => x + y, 0) / SAMPLES;
  // The trunk takes a share of the fore-aft balance so the pelvis can hold still; how much a turn of it moves the weight comes from the model.
  const probe = (pitch: number) => {
    const q = solved.rows[0].slice(0, n), c = [...solved.rows[0].slice(n)];
    c[4] = pitch;
    const inv = invert(bodyFrame(centre, c));
    legs.forEach((_, i) => reach(i, inv, footAt(i, 0), q, inAir(i, 0)));
    return applyTransform(bodyFrame(centre, c), com(q))[0];
  };
  const trunk = Math.max((probe(gait.lean + 0.02) - probe(gait.lean - 0.02)) / 0.04, 0.05);
  const finish = (sink: number) => {
    let miss = 0;
    const list = solved.rows.map((r, k) => {
      const d = sway[0][k] - fore;
      const s = k / SAMPLES, c = [fore + (1 - gait.trunkShare) * d, sway[1][k], r[n + 2] - sink, r[n + 3], Math.max(bowed(s) + gait.trunkShare * d / trunk, 0), r[n + 5]];
      const q = r.slice(0, n), inv = invert(bodyFrame(centre, c));
      legs.forEach((_, i) => {
        const left = reach(i, inv, footAt(i, s), q, inAir(i, s));
        if (!inAir(i, s)) miss = Math.max(miss, left);
      });
      return [...q, ...c];
    });
    return { list, miss };
  };
  // Rounding the sway can ask a straight leg for more than it has; a few millimetres lower gives it back.
  let sink = 0, last = finish(0);
  while (last.miss > 2e-4 && sink < 0.02) last = finish((sink += 0.004));
  // A planted foot that cannot stay put is not a gait this body can do.
  if (last.miss > 1e-3) return null;
  const rows = last.list;
  let { worst } = solved;

  // The lead: knees bend and the weight starts across, then one whole cycle whose steps land on the narrower spots.
  const fade = Math.max(2, Math.round(gait.lead / dt)), lead = fade + (gait.air ? SAMPLES : 0), T = lead * dt;
  const above = robot.joints.map((_, i) => !legs.some((p) => robot.limbs[p.limb].index.includes(i)));
  const start = [...q0, 0, 0, settle, 0, 0, 0];
  const c0 = applyTransform(bodyFrame(centre, start.slice(n)), com(q0));
  const seat = tips.map((t) => ({ R: t.R, p: add(t.p, [0, 0, settle]) }));
  const shifts = feet.map((f, i) => sub(f.rest.p, wide[i].rest.p));
  // The first steps start from the feet as they stood: the wider that was, the more knee they need.
  const low = gait.air ? Math.min(...rows.map((r) => r[n + 2])) : rows[0][n + 2], bend = 0.5 * Math.max(...shifts.map((d) => norm(d)));
  const wideZmp = zmpPlan(wide, gait, body.forward, body.left, SAMPLES);
  // The first step is a lighter one, from a body that has only just started moving.
  const first = { ...gait, height: FIRST * gait.height, ahead: FIRST * gait.ahead };
  const footLead = (i: number, j: number): Transform => {
    if (j < fade) return blend(seat[i], wide[i].rest, Math.min(1, j / (0.4 * fade)));
    const s = (j - fade) / SAMPLES, u = s - gait.lifts[i];
    if (u < 0) return wide[i].rest;
    return u < gait.air ? swingPose(wide[i], u / gait.air, first, body.forward, shifts[i]) : feet[i].rest;
  };
  const effective = [0, 1].map((a) => weight[a].map((v, k) => v - (weight[a][(k + 1) % SAMPLES] - 2 * v + weight[a][(k + SAMPLES - 1) % SAMPLES]) / (dt * dt * pull)));
  const path = [0, 1].map((a) => {
    const line = Array.from({ length: lead + SAMPLES }, (_, j) => {
      if (j < fade) return c0[a] + (wideZmp[0][a] - c0[a]) * ease(j / fade);
      const k = (j - fade) % SAMPLES;
      if (j >= lead) return effective[a][k];
      // The first flight stands on the wide foot, the second on the narrow one.
      const x = ease((k / SAMPLES - 0.35) / 0.3);
      return wideZmp[k][a] + (effective[a][k] - wideZmp[k][a]) * x;
    });
    const solved1 = pendulumLine(line, dt, pull, c0[a], weight[a][0]);
    return solved1.map((v, j) => c0[a] + (v - c0[a]) * ease(j / (0.6 * fade)));
  });
  const head = new Array<number[]>(lead);
  head[0] = start;
  // Backwards from the bent pose: IK cannot start from a straight knee.
  const q = rows[0].slice(0, n), c = rows[0].slice(n);
  for (let j = lead - 1; j >= 1; j--) {
    const k = (((j - fade) % SAMPLES) + SAMPLES) % SAMPLES, row = rows[k], e = ease(j / (fade + (gait.air ? 0.3 * SAMPLES : 0)));
    above.forEach((free, i) => free && (q[i] = q0[i] + (row[i] - q0[i]) * e));
    // Arms clear the hips before they start to swing: coming down from a pose they could otherwise cut through the thigh.
    for (const a of arms) if (a.out !== null) q[a.out] = q0[a.out] + (row[a.out] - q0[a.out]) * ease(j / (0.4 * fade));
    c[2] = start[n + 2] + (low - bend - start[n + 2]) * ease(j / (0.8 * fade)) + (row[n + 2] - low + bend) * ease((j - lead + 0.3 * SAMPLES) / (0.3 * SAMPLES));
    c[3] = row[n + 3] * e;
    c[4] = row[n + 4] * e;
    c[5] = row[n + 5] * e;
    const s = (j - fade) / SAMPLES;
    worst = Math.max(worst, stand(legs.map((_, i) => footLead(i, j)), c, [path[0][j], path[1][j]], q, legs.map((_, i) => j >= fade && inAir(i, s))));
    head[j] = [...q, ...c];
  }
  if (worst > MISSED) return null;

  const row = leadSpline(head, rows, gait.period);
  const clip = {
    period: gait.period,
    lead: T,
    at: (t: number) => enforceLimits(robot.joints, row(t).slice(0, n)),
    body: (t: number) => bodyFrame(centre, row(t).slice(n)),
  };
  // The worst the ZMP gets to the edge of whatever is on the floor, as the clip really plays.
  const moments = Array.from({ length: CHECK }, (_, k) => T + (k / CHECK) * gait.period);
  const measured = zmpOf(moments.map((t) => {
    const B = clip.body(t);
    return points(clip.at(t)).map((b) => ({ m: b.m, p: applyTransform(B, b.p) }));
  }), gait.period / CHECK, gravity, footing.floor);
  const balance = Math.min(...moments.map((t, k) => {
    const B = clip.body(t), q = clip.at(t);
    const touching = legs.flatMap((p, i) => {
      const l = robot.limbs[p.limb], F = compose(B, chainFrames(l.chain, limbQ(l, q)).tip), point = contacts[i];
      // A point foot rolls as the leg turns over it: it stands on its whole outline for as long as its point is down.
      if (point) return applyTransform(F, point)[2] < applyTransform(feet[i].rest, point)[2] + TOUCH ? soleOnFloor(feet[i]) : [];
      return feet[i].sole.map((c) => applyTransform(F, c)).filter((c) => c[2] < footing.floor + TOUCH).map((c): P2 => [c[0], c[1]]);
    });
    return margin(supportPolygon(touching), measured[k]);
  }));
  return { ...clip, balance };
}
