/**
 * One looping cycle: from home, carry the object A → B, carry it back B → A, return home.
 * Both legs reuse the same descents and carry arc, so the object ends where it began.
 */
import type { Vec3 } from '../../math/linear/vec';
import type { PlanProblem, TaskClip, TaskObject } from '../types';
import { restingPose, heldOffset, settle } from './object';
import { type PlanContext, solveAt } from './poses';
import { type Segment, moveTime, timeline } from './timeline';

export interface CycleInput {
  ctx: PlanContext;
  home: number[];
  pick: Vec3;
  place: Vec3;
  object: TaskObject;
  floorZ: number;
  /** Clearance over the object's top while carrying (m). */
  lift: number;
  /** Centre the carry arc swings around (the arm's base). */
  base: Vec3;
}

/** A point on the way from a to b swinging around the base, so the carry stays inside the reach ring. */
function arcPoint(a: Vec3, b: Vec3, base: Vec3, u: number, z: number): Vec3 {
  const [ra, rb] = [Math.hypot(a[0] - base[0], a[1] - base[1]), Math.hypot(b[0] - base[0], b[1] - base[1])];
  const [ta, tb] = [Math.atan2(a[1] - base[1], a[0] - base[0]), Math.atan2(b[1] - base[1], b[0] - base[0])];
  const dt = Math.atan2(Math.sin(tb - ta), Math.cos(tb - ta));
  const [r, t] = [ra + (rb - ra) * u, ta + dt * u];
  return [base[0] + r * Math.cos(t), base[1] + r * Math.sin(t), z];
}

export function planCycle(c: CycleInput): TaskClip | PlanProblem {
  const { ctx, object: o } = c;
  const graspZ = c.floorZ + o.graspZ, aboveZ = c.floorZ + o.graspZ + o.size[2] + c.lift;
  const descent = (p: Vec3, from: number[], where: 'pick' | 'place'): number[][] | PlanProblem => {
    const qs: number[][] = [];
    for (let k = 0; k <= 3; k++) {
      const q = solveAt(ctx, [p[0], p[1], aboveZ + ((graspZ - aboveZ) * k) / 3], qs.at(-1) ?? from);
      if (!q) return { where, message: k ? `The tool cannot reach down to the ${where} spot` : `The ${where} spot is out of reach` };
      qs.push(q);
    }
    return qs;
  };
  const dA = descent(c.pick, c.home, 'pick');
  if (!Array.isArray(dA)) return dA;
  const arc = [dA[0]];
  for (const u of [1 / 3, 2 / 3]) {
    const q = solveAt(ctx, arcPoint(c.pick, c.place, c.base, u, aboveZ), arc[arc.length - 1]);
    if (!q) return { where: 'path', message: 'The arm cannot carry between these spots' };
    arc.push(q);
  }
  const dB = descent(c.place, arc[arc.length - 1], 'place');
  if (!Array.isArray(dB)) return dB;
  arc.push(dB[0]);
  const rev = (qs: number[][]) => [...qs].reverse();
  const move = (qs: number[][], g: number): Segment => ({ qs, gap: [g, g], duration: moveTime(qs) });
  const dwell = (q: number[], g0: number, g1: number, duration = 0.45): Segment => ({ qs: [q], gap: [g0, g1], duration });
  const [gA, gB, { open, hold }] = [dA[3], dB[3], o];
  const segments = [
    move([c.home, dA[0]], open), move(dA, open), dwell(gA, open, hold),
    move(rev(dA), hold), move(arc, hold), move(dB, hold), dwell(gB, hold, open),
    move(rev(dB), open), dwell(dB[0], open, open, 0.3), move(dB, open), dwell(gB, open, hold),
    move(rev(dB), hold), move(rev(arc), hold), move(dA, hold), dwell(gA, hold, open),
    move(rev(dA), open), move([dA[0], c.home], open),
  ];
  const line = timeline(segments);
  const [tGrasp1, tRelease1, tGrasp2, tRelease2] = [line.starts[3], line.starts[6], line.starts[11], line.starts[14]];
  const atA = restingPose(ctx, gA, o, c.floorZ);
  const off1 = heldOffset(ctx, gA, atA);
  const atB = settle(ctx, gB, off1, o, c.floorZ);
  const off2 = heldOffset(ctx, gB, atB);
  return {
    period: line.period,
    at: line.at,
    object(t) {
      const x = ((t % line.period) + line.period) % line.period;
      if (x < tGrasp1 || x >= tRelease2) return { held: false, pose: atA };
      if (x < tRelease1) return { held: true, offset: off1 };
      if (x < tGrasp2) return { held: false, pose: atB };
      return { held: true, offset: off2 };
    },
  };
}
