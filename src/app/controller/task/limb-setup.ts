/**
 * Pick and place with one arm of a robot that has several limbs: a humanoid's hand, a rover's arm, one arm of
 * a dual-arm cell. The planner works on that arm's chain; every other joint holds its home, so legs stay
 * planted. Hands carry no jaws, so the box sits in the palm.
 */
import { chainFrames } from '../../../core/chain/kinematics/frames';
import { limbQ } from '../../../core/chain/limbs/types';
import { contactText } from '../../../core/collision/hull';
import { matVec, transpose } from '../../../core/math/linear/mat3';
import { type Vec3, add, cross, dot, normalize, scale, sub } from '../../../core/math/linear/vec';
import { workStance } from '../../../core/motion/body';
import { easeOffLimits } from '../../../core/motion/ready';
import { approachIk } from '../../../core/solvers/ik/approach';
import type { TaskObject, ToolGeometry } from '../../../core/task/types';
import { bodyFor } from '../../robots/body';
import type { RobotSession } from '../../robots/session';
import type { TaskSetup } from './setup';

/** The arm to work with: the focused one if it is an arm, else the right (most robots' working side). */
export function workingArm(s: RobotSession, focus: number): number | null {
  const arms = bodyFor(s).parts.filter((p) => p.kind === 'arm' && p.shoulder);
  const focused = arms.find((p) => p.limbs.includes(focus));
  return (focused ?? arms.find((p) => p.side === 'right') ?? arms[0])?.limb ?? null;
}

export function limbSetup(s: RobotSession, focus: number): TaskSetup | null {
  const limb = workingArm(s, focus);
  if (limb === null) return null;
  const body = bodyFor(s), part = body.partOf[limb];
  const l = s.limbs[limb];
  // A hanging arm's straight elbow sits on its stop, where warm-started IK stalls; start a little bent.
  const home = limbQ(l, easeOffLimits(s, s.home, l.index, 0.05, 0.08));
  const reach = part.reach!, shoulder = part.shoulder!;
  const expand = (qc: number[]) => {
    const q = [...s.home];
    l.index.forEach((i, k) => (q[i] = qc[k]));
    return q;
  };
  const probe = (qc: number[]) => {
    const hit = s.collision?.hit(expand(qc));
    return hit ? contactText(hit) : null;
  };

  const f = chainFrames(l.chain, home);
  // A waist the arms share may turn, but a pitched or rolled torso reads as the robot toppling: hold those.
  const others = new Set(body.parts.filter((p) => p.kind === 'arm' && p.limb !== limb).flatMap((p) => s.limbs[p.limb].index));
  const chain = { ...l.chain, joints: l.chain.joints.map((j, k) => (others.has(l.index[k]) && Math.abs(f.axes[k][2]) < 0.9 ? { ...j, limits: [home[k], home[k]] as [number, number] } : j)) };
  const back = [...f.origins].reverse().find((o) => Math.hypot(...sub(f.tip.p, o)) > 0.05 * reach) ?? shoulder;
  const toLocal = (v: Vec3) => normalize(matVec(transpose(f.tip.R), v));
  const along = normalize(sub(f.tip.p, back));
  const across = cross(along, body.left);
  const tool: ToolGeometry = {
    approach: toLocal(along),
    side: toLocal(Math.hypot(...across) > 1e-6 ? normalize(cross(across, along)) : body.left),
    // Planned at the wrist: a palm offset swings with the hand's tilt and throws warm starts away.
    beyond: 0,
  };
  const w = 0.14 * reach, h = 1.1 * w;
  const object: TaskObject = { kind: 'block', label: 'Box', size: [w, w, h], hold: 0, open: 0, graspZ: 1.05 * h };
  // Position only: a hand grasps at any tilt, and chasing one contorts the shoulder and breaks pose-to-pose continuity.
  const ctx = { chain, tool, length: 0, maxTilt: Math.PI, probe };

  const stance = workStance(body);
  const ahead: Vec3 = add(add(shoulder, scale(body.forward, 0.5 * reach)), [0, 0, -0.45 * reach]);
  const seed = approachIk(chain, add(ahead, [0, 0, tool.beyond]), [0, 0, -1], tool.approach, home, ctx.length).q;
  const floorZ = s.assembly.floorZ;
  return {
    ctx, rig: null, object, home, seed, floorZ, surfaceZ: stance.hand, lift: 0.25 * reach,
    base: [shoulder[0], shoulder[1], shoulder[2]], radius: 1.05 * reach, probe,
    // Standing robots work at their bench; other multi-limb robots search up from the floor as arms do.
    limb, expand, work: s.category === 'humanoid' ? Math.max(stance.hand, floorZ) : undefined, heading: Math.atan2(dot(body.forward, [0, 1, 0]), dot(body.forward, [1, 0, 0])),
    label: body.labels[limb],
  };
}
