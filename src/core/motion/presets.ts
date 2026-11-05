/** The motion presets that suit a robot, from its limbs' roles (legs, arms, wheels). */
import type { Vec3 } from '../math/linear/vec';
import { type Body, bodyOf } from './body';
import { drive, jointWave } from './generators/analytic';
import { pendulumPresets, pendulumRow } from './generators/pendulum';
import { slalom, wheelsOf } from './generators/steer';
import { taskClip } from './generators/task';
import * as arm from './paths/arm';
import { bob, footPath, gaitPhases } from './paths/gait';
import { armSwings } from './stepping/arms';
import { armWave, bowAt, bowRung, waveAt, waveRung } from './stepping/gesture';
import { type LegGait, leggedAt, leggedRung } from './stepping/legged';
import { marchAt, marchRung } from './stepping/march';
import { squatAt, squatRung } from './stepping/squat';
import { chainFrames } from '../chain/kinematics/frames';
import { limbQ } from '../chain/limbs/types';
import { readyPose } from './ready';
import { type LimbRole, limbRoles } from './roles';
import type { Footing, MotionClip, MotionPreset, MotionRobot } from './types';

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

const each = (pick: (r: LimbRole) => boolean, path: (r: LimbRole, size: number) => (s: number) => Vec3): LimbPaths =>
  (roles, size) => new Map(roles.filter(pick).map((r) => [r.limb, path(r, size)]));

const gait = (kind: 'trot' | 'walk' | 'tripod' | 'march', withArms = false): LimbPaths => (roles, size) => {
  const legs = roles.filter((r) => r.role === 'leg');
  const phases = gaitPhases(legs, kind);
  const map = new Map(legs.map((l, i) => [l.limb, footPath(l, phases[i], size, kind === 'march' ? 0 : 1)]));
  if (withArms) for (const a of roles.filter((r) => r.role === 'arm')) map.set(a.limb, arm.reach({ ...a }, size * 0.4));
  return map;
};

/** How a robot's stepping is settled: per motion, a `rung` from the generated table, null if it cannot, missing if the table has never seen it. */
export interface Stepping {
  footing: () => Footing;
  rungs?: Record<string, number | null>;
}

/** A motion with a ladder of easier versions: the body it needs, the first rung that body can do, and the clip at a rung. */
interface Stepper {
  search(r: MotionRobot, q: number[], shape: Footing, body: Body, size?: number, budget?: number): number | null;
  at(r: MotionRobot, q: number[], shape: Footing, body: Body, size: number, rung: number): MotionClip | null;
}

const onLegs = (kind: LegGait): Stepper => ({
  search: (...a) => leggedRung(kind, ...a),
  at: (...a) => leggedAt(kind, ...a),
});

const planted: Stepper = { search: squatRung, at: squatAt };
const STEPPERS: Record<string, Stepper> = {
  march: { search: marchRung, at: marchAt }, squat: planted, bob: planted, trot: onLegs('trot'), walk: onLegs('walk'), tripod: onLegs('tripod'),
  wave: { search: waveRung, at: waveAt }, bow: { search: bowRung, at: bowAt },
};

/** The stepping motions a body has the legs for. */
export function steppersFor(body: Body): string[] {
  const legs = body.parts.filter((p) => p.kind === 'leg').length;
  return legs === 2 ? ['march', 'squat', ...(body.parts.some((p) => p.kind === 'arm') ? ['wave'] : []), 'bow'] : legs === 4 ? ['trot', 'walk', 'bob'] : legs >= 6 ? ['tripod', 'bob'] : [];
}

/** The first rung of a stepping motion this body can do: what the generated table holds. */
export const steppingRung = (id: string, robot: MotionRobot, q0: number[], footing: Footing, body: Body): number | null => STEPPERS[id].search(robot, q0, footing, body);

/** Milliseconds a robot the table has never seen may search for a gait, when the motion is asked for. */
const SEARCH = 3000;

/** Nothing is solved here: this runs while a robot opens. A body with no rung in the table finds its gait when the motion is played. */
function stepping(preset: Omit<MotionPreset, 'build'>, category: string, { footing, rungs }: Stepping): MotionPreset | null {
  const rung = rungs?.[preset.id], how = STEPPERS[preset.id];
  if (rung === null) return null;
  return {
    ...preset,
    build: (r, q, size) => {
      const body = bodyOf(r, q, category), shape = footing();
      const at = rung ?? how.search(r, q, shape, body, size, SEARCH);
      const clip = at === null ? null : how.at(r, q, shape, body, size, at);
      if (!clip) throw new Error(`no ${preset.id} for this body`);
      return clip;
    },
  };
}

/** `walks` says how the robot stands and what is known of its gait; with it, a biped's March carries its body. */
export function presetsFor(robot: MotionRobot, q0: number[], category: string, walks?: Stepping): MotionPreset[] {
  // A hand's fingers are not arms: its grips and gestures come from src/app/controller/grasp, around real objects.
  if (category === 'hand') return [];
  const row = category === 'other' ? pendulumRow(robot, q0) : null;
  if (row) return pendulumPresets(row);
  const roles = limbRoles(robot, q0);
  const body = bodyOf(robot, q0, category);
  // One limb per real end effector: a hand's fingertip chains would fight over the same arm joints.
  const leads = new Set(body.parts.map((p) => p.limb));
  // A bolted dual arm hanging its tools low has arms, however its limbs read.
  const bolted = category === 'arm';
  const legs = bolted ? 0 : roles.filter((r) => r.role === 'leg' && leads.has(r.limb)).length;
  const isArm = (r: LimbRole) => (r.role === 'arm' || (bolted && r.role === 'leg')) && leads.has(r.limb);
  const arms = roles.filter(isArm).length;
  const out: MotionPreset[] = [];
  const wheels = new Set(roles.filter((r) => r.role !== 'arm').flatMap((r) => robot.limbs[r.limb].index));
  if (category === 'mobile' || category === 'aerial') {
    out.push({ id: 'drive', label: category === 'aerial' ? 'Spin' : 'Drive', hint: 'Continuous joints turn', build: (r, q, s) => drive(r, q, wheels, s) });
    if (wheelsOf(robot, q0, body).some((w) => w.steer !== null)) {
      out.push({ id: 'slalom', label: 'Slalom', hint: 'Wheels roll, steering sweeps', build: (r, q, s) => slalom(r, q, wheelsOf(r, q, bodyOf(r, q, category)), s) });
    }
  } else if (legs >= 4) {
    const steps = [
      task('trot', 'Trot', 'Diagonal legs together', 1.2, gait('trot')),
      task('walk', 'Walk', 'One foot at a time', 1.8, gait('walk')),
      task('tripod', 'Tripod', 'Alternating tripods', 1.4, gait('tripod')),
      task('bob', 'Bob', 'Crouch and rise, every foot planted', 2, each((r) => r.role === 'leg', bob)),
    ].filter((p) => steppersFor(body).includes(p.id));
    out.push(...steps.flatMap((p) => (walks ? stepping(p, category, walks) ?? [] : p)));
  } else if (legs === 2) {
    const march = task('march', 'March', 'Knees up, arms swing', 1.6, gait('march', true));
    // Limb roles call anything hanging low a leg; only a body that stands on two of them can step.
    const standing = body.parts.filter((p) => p.kind === 'leg').length === 2;
    const squat = task('squat', 'Squat', 'Sit down and stand up, arms out for balance', 2.4, each((r) => r.role === 'leg', bob));
    const wave = { id: 'wave', label: 'Wave', hint: 'Hand up, three waves, weight on the far foot' };
    const bow = { id: 'bow', label: 'Bow', hint: 'Bend at the hips, hold, rise, feet planted' };
    out.push(...[march, squat].flatMap((p) => (!walks ? p : standing ? stepping(p, category, walks) ?? [] : [])));
    if (walks && standing) out.push(...[...(arms ? [wave] : []), bow].flatMap((p) => stepping(p, category, walks) ?? []));
  }
  // Some humanoid manifests list one leg chain; the other leg is still there.
  const biped = legs === 2 || (category === 'humanoid' && legs >= 1);
  if (arms && biped) {
    // A body that cannot balance a wave still has an arm to wave.
    if (!out.some((p) => p.id === 'wave') && armSwings(robot, q0, body).length) {
      out.push({ id: 'wave', label: 'Wave', hint: 'Hand up, three waves', build: (r, q, s) => {
        const clip = armWave(r, q, bodyOf(r, q, category), s);
        if (!clip) throw new Error('no arm to wave');
        return clip;
      } });
    }
  } else if (arms) {
    out.push(task('circle', 'Circle', 'Tool traces a circle', 3, each(isArm, arm.circle)));
    out.push(task('eight', 'Figure 8', 'Tool traces a lemniscate', 4, each(isArm, arm.figureEight)));
  }
  // A robot that stands on its legs does not ripple them with its body pinned in the air.
  if (!biped && !(walks && legs)) out.push({ id: 'wave-joints', label: 'Joint wave', hint: 'A ripple through every joint', build: (r, q, s) => jointWave(r, q, s) });
  return out;
}
