/** The motion presets that suit a robot, from its limbs' roles (legs, arms, wheels). */
import type { Vec3 } from '../math/linear/vec';
import { drive, jointWave } from './generators/analytic';
import { taskClip } from './generators/task';
import * as arm from './paths/arm';
import { bob, footPath, gaitPhases } from './paths/gait';
import { readyPose } from './ready';
import { type LimbRole, limbRoles } from './roles';
import type { MotionPreset, MotionRobot } from './types';

type LimbPaths = (roles: LimbRole[], size: number) => Map<number, (s: number) => Vec3>;

function task(id: string, label: string, hint: string, period: number, paths: LimbPaths): MotionPreset {
  return {
    id, label, hint,
    build: (robot, q0, size) => {
      const ready = readyPose(robot, q0, limbRoles(robot, q0));
      const byLimb = paths(limbRoles(robot, ready), size);
      return taskClip(robot, ready, (s) => robot.limbs.map((_, i) => byLimb.get(i)?.(s) ?? null), period);
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
  const legs = roles.filter((r) => r.role === 'leg').length;
  const arms = roles.filter((r) => r.role === 'arm').length;
  const out: MotionPreset[] = [];
  const wheels = new Set(roles.filter((r) => r.role !== 'arm').flatMap((r) => robot.limbs[r.limb].index));
  if (category === 'mobile' || category === 'aerial') {
    out.push({ id: 'drive', label: category === 'aerial' ? 'Spin' : 'Drive', hint: 'Continuous joints turn', build: (r, q, s) => drive(r, q, wheels, s) });
  } else if (legs >= 4) {
    out.push(task('trot', 'Trot', 'Diagonal legs together', 1.2, gait('trot')));
    if (legs === 4) out.push(task('walk', 'Walk', 'Four-beat lateral sequence', 1.8, gait('walk')));
    if (legs >= 6) out.push(task('tripod', 'Tripod', 'Alternating tripods', 1.4, gait('tripod')));
    out.push(task('bob', 'Bob', 'All feet together', 2, each((r) => r.role === 'leg', bob)));
  } else if (legs === 2) {
    out.push(task('march', 'March', 'Knees up, arms swing', 1.6, gait('march', true)));
    out.push(task('squat', 'Squat', 'Both legs fold', 2.4, each((r) => r.role === 'leg', bob)));
  }
  if (arms && legs === 2) {
    out.push(task('wave', 'Wave', 'One hand up', 1.6, (roles, size) => {
      const hand = roles.filter((r) => r.role === 'arm').sort((a, b) => Number(a.left) - Number(b.left))[0];
      return new Map([[hand.limb, arm.wave(hand, size)]]);
    }));
    if (arms >= 2) out.push(task('reach', 'Reach', 'Both hands forward', 2.4, each((r) => r.role === 'arm', arm.reach)));
  } else if (arms) {
    out.push(task('circle', 'Circle', 'Tool traces a circle', 3, each((r) => r.role === 'arm', arm.circle)));
    out.push(task('eight', 'Figure 8', 'Tool traces a lemniscate', 4, each((r) => r.role === 'arm', arm.figureEight)));
    out.push(task('pick', 'Pick & place', 'Down at A, carry, down at B', 4, each((r) => r.role === 'arm', arm.pickAndPlace)));
  }
  out.push({ id: 'wave-joints', label: 'Joint wave', hint: 'A ripple through every joint', build: (r, q, s) => jointWave(r, q, s) });
  return out;
}
