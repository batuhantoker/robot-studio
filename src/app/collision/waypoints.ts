/**
 * The default trajectory, fitted to what the robot can do: each joint swings only as far as it
 * gets on its own before touching, then the joints that cause a contact are pulled in one by one.
 */
import type { RobotJoint } from '../../core/chain/limbs/types';
import { guardMove, probeSteps } from '../../core/collision/move';
import type { CollisionChecker } from '../../physics/collision/checker';
import { stateAt } from '../controller/modes/trajectory';

const SAMPLES = 160;
const PULL = 0.6;

export function clearWaypoints(s: { collision: CollisionChecker | null; joints: RobotJoint[] }, waypoints: number[][], duration: number): number[][] {
  const c = s.collision;
  const base = waypoints[0];
  if (!c || !base || c.hit(base)) return waypoints;
  const probe = (q: number[]) => c.hit(q);
  const steps = probeSteps(s.joints.map((j) => j.type));
  const limits = s.joints.map((j) => j.limits);
  // Per joint, the swing each way (-, +) it can make alone, with a margin when it was stopped.
  const room = base.map((_, j) => [-1, 1].map((dir) => {
    const far = Math.max(0, ...waypoints.map((w) => dir * (w[j] - base[j])));
    const to = [...base];
    to[j] += dir * far;
    const g = guardMove(probe, base, to, steps);
    return g.contact ? Math.abs(g.q[j] - base[j]) * 0.8 : far;
  }));
  const scale = base.map(() => 1);
  const fitted = () => waypoints.map((w) => w.map((v, j) =>
    base[j] + Math.min(Math.max((v - base[j]) * scale[j], -room[j][0]), room[j][1])));
  const times = Array.from({ length: SAMPLES + 1 }, (_, i) => (duration * i) / SAMPLES);
  for (let round = 0; round < 40; round++) {
    const w = fitted();
    const t = times.find((x) => c.hit(stateAt(limits, w, duration, x).q));
    if (t === undefined) return w;
    const q = stateAt(limits, w, duration, t).q;
    const out = base.map((b, j) => Math.abs(q[j] - b));
    const order = out.map((_, j) => j).filter((j) => out[j] > 1e-6).sort((a, b) => out[b] - out[a]);
    // Pull in the joint whose own retreat clears this pose, else the one furthest out.
    const culprit = order.find((j) => {
      const p = [...q];
      p[j] = base[j] + (q[j] - base[j]) * PULL;
      return !c.hit(p);
    }) ?? order[0];
    if (culprit === undefined) break;
    scale[culprit] *= PULL;
  }
  // Still touching somewhere: the playback stop will hold it there.
  return fitted();
}
