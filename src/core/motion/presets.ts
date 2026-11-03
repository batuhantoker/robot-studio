/** The motion presets that suit a robot, from its limbs' roles (legs, arms, wheels). */
import type { Vec3 } from '../math/linear/vec';
import { bodyOf } from './body';
import { drive, jointWave } from './generators/analytic';
import { slalom, wheelsOf } from './generators/steer';
import { taskClip } from './generators/task';
import * as arm from './paths/arm';
import { type BenchFrame, type Pose, benchFrame, benchReach, reachAhead, turnAndPlace, twoHandLift, waistPins } from './paths/work';
import { bob, footPath, gaitPhases } from './paths/gait';
import { chainFrames } from '../chain/kinematics/frames';
import { limbQ } from '../chain/limbs/types';
import { easeOffLimits, readyPose } from './ready';
import { type LimbRole, limbRoles } from './roles';
import type { MotionPreset, MotionRobot } from './types';

type LimbPaths = (roles: LimbRole[], size: number) => Map<number, (s: number) => Vec3>;

/** Feet with an ankle to keep them flat: the tip axis that points up at q0, per driven leg. */
function soles(robot: MotionRobot, q0: number[], driven: Iterable<number>): Map<number, Vec3> {
  const roles = limbRoles(robot, q0);
  return new Map([...driven].filter((l) => roles[l].role === 'leg' && robot.limbs[l].index.length >= 5).map((l) => {
    const R = chainFrames(robot.limbs[l].chain, limbQ(robot.limbs[l], q0)).tip.R;
    return [l, [R[6], R[7], R[8]] as Vec3];
  }));
}

function task(id: string, label: string, hint: string, period: number, paths: LimbPaths): MotionPreset {
  return {
    id, label, hint,
    build: (robot, q0, size) => {
      const leads = new Set(bodyOf(robot, q0).parts.map((p) => p.limb));
      const lead = (q: number[]) => limbRoles(robot, q).filter((r) => leads.has(r.limb));
      // Knees ease off their stops only when the legs move; an arm motion leaves the stance as it stands.
      const legs = [...paths(lead(q0), size).keys()].some((l) => limbRoles(robot, q0)[l].role === 'leg');
      const ready = legs ? readyPose(robot, q0, limbRoles(robot, q0)) : q0;
      const byLimb = paths(lead(ready), size);
      return taskClip(robot, ready, (s) => robot.limbs.map((_, i) => byLimb.get(i)?.(s) ?? null), period, 48, { level: soles(robot, q0, byLimb.keys()) });
    },
  };
}

/** Both hands of an arm pair on keyed targets; legs stay where they stand. */
function pairTask(id: string, label: string, hint: string, period: number, make: (w: BenchFrame, size: number) => (s: number) => Pose): MotionPreset {
  return {
    id, label, hint,
    build: (robot, q0, size) => {
      const body = bodyOf(robot, q0, 'humanoid');
      const arms = body.parts.filter((p) => p.kind === 'arm').flatMap((p) => robot.limbs[p.limb].index);
      // A straight elbow or a shoulder on its stop stalls warm-started IK, as a straight knee does.
      const ready = easeOffLimits(robot, q0, arms, 0.05, 0.08);
      const w = benchFrame(robot, ready, body)!;
      const path = make(w, size);
      // A hand modelled as fingertip chains keeps its fingers still; IK would curl them into each other.
      const fingers = body.parts.filter((p) => p.kind === 'arm' && p.limbs.length > 1).flatMap((p) => {
        const common = p.limbs.map((i) => new Set(robot.limbs[i].index)).reduce((a, b) => new Set([...a].filter((i) => b.has(i))));
        return robot.limbs[p.limb].index.filter((i) => !common.has(i));
      });
      const waist = waistPins(w, ready, path);
      const pins = (s: number) => new Map([...fingers.map((i): [number, number] => [i, ready[i]]), ...waist(s)]);
      return taskClip(robot, ready, (s) => {
        const [l, r] = path(s).hands;
        return robot.limbs.map((_, i) => (i === w.left.limb ? l : i === w.right.limb ? r : null));
      }, period, 48, { pins, posture: ready });
    },
  };
}

const each = (pick: (r: LimbRole) => boolean, path: (r: LimbRole, size: number) => (s: number) => Vec3): LimbPaths =>
  (roles, size) => new Map(roles.filter(pick).map((r) => [r.limb, path(r, size)]));

const gait = (kind: 'trot' | 'walk' | 'tripod' | 'march', withArms = false): LimbPaths => (roles, size) => {
  const legs = roles.filter((r) => r.role === 'leg');
  const phases = gaitPhases(legs, kind);
  const map = new Map(legs.map((l, i) => [l.limb, footPath(l, phases[i], size, kind === 'march' ? 0 : 1)]));
  if (withArms) for (const a of roles.filter((r) => r.role === 'arm')) map.set(a.limb, arm.reach({ ...a }, size * 0.4));
  return map;
};

export function presetsFor(robot: MotionRobot, q0: number[], category: string): MotionPreset[] {
  const roles = limbRoles(robot, q0);
  const body = bodyOf(robot, q0, category);
  // One limb per real end effector: a hand's fingertip chains would fight over the same arm joints.
  const leads = new Set(body.parts.map((p) => p.limb));
  const legs = roles.filter((r) => r.role === 'leg' && leads.has(r.limb)).length;
  const arms = roles.filter((r) => r.role === 'arm' && leads.has(r.limb)).length;
  const isArm = (r: LimbRole) => r.role === 'arm' && leads.has(r.limb);
  const out: MotionPreset[] = [];
  const wheels = new Set(roles.filter((r) => r.role !== 'arm').flatMap((r) => robot.limbs[r.limb].index));
  if (category === 'mobile' || category === 'aerial') {
    out.push({ id: 'drive', label: category === 'aerial' ? 'Spin' : 'Drive', hint: 'Continuous joints turn', build: (r, q, s) => drive(r, q, wheels, s) });
    if (wheelsOf(robot, q0, body).some((w) => w.steer !== null)) {
      out.push({ id: 'slalom', label: 'Slalom', hint: 'Wheels roll, steering sweeps', build: (r, q, s) => slalom(r, q, wheelsOf(r, q, bodyOf(r, q, category)), s) });
    }
  } else if (legs >= 4) {
    out.push(task('trot', 'Trot', 'Diagonal legs together', 1.2, gait('trot')));
    if (legs === 4) out.push(task('walk', 'Walk', 'Four-beat lateral sequence', 1.8, gait('walk')));
    if (legs >= 6) out.push(task('tripod', 'Tripod', 'Alternating tripods', 1.4, gait('tripod')));
    out.push(task('bob', 'Bob', 'All feet together', 2, each((r) => r.role === 'leg', bob)));
  } else if (legs === 2) {
    out.push(task('march', 'March', 'Knees up, arms swing', 1.6, gait('march', true)));
    out.push(task('squat', 'Squat', 'Both legs fold', 2.4, each((r) => r.role === 'leg', bob)));
  }
  // Some humanoid manifests list one leg chain; the other leg is still there.
  const biped = legs === 2 || (category === 'humanoid' && legs >= 1);
  const pair = arms >= 2 && biped && !!benchFrame(robot, q0, body);
  if (arms && biped) {
    out.push(task('wave', 'Wave', 'One hand up', 1.6, (roles, size) => {
      const hand = roles.filter(isArm).sort((a, b) => Number(a.left) - Number(b.left))[0];
      return new Map([[hand.limb, arm.wave(hand, size)]]);
    }));
    if (pair) {
      out.push(pairTask('reach', 'Reach', 'Both hands forward', 2.4, reachAhead));
      out.push(pairTask('bench', 'Bench work', 'Each hand reaches out and works the bench', 4.8, benchReach));
      out.push(pairTask('lift', 'Two-hand lift', 'Grip a box, lift it to the chest, set it down', 5.2, twoHandLift));
      out.push(pairTask('turn', 'Turn & place', 'Lift, turn at the waist, set down aside', 6, turnAndPlace));
    } else if (arms >= 2) out.push(task('reach', 'Reach', 'Both hands forward', 2.4, each(isArm, arm.reach)));
  } else if (arms) {
    out.push(task('circle', 'Circle', 'Tool traces a circle', 3, each(isArm, arm.circle)));
    out.push(task('eight', 'Figure 8', 'Tool traces a lemniscate', 4, each(isArm, arm.figureEight)));
    out.push(task('pick', 'Pick & place', 'Down at A, carry, down at B', 4, each(isArm, arm.pickAndPlace)));
  }
  out.push({ id: 'wave-joints', label: 'Joint wave', hint: 'A ripple through every joint', build: (r, q, s) => jointWave(r, q, s) });
  return out;
}
