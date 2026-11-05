/** Holds the playing motion clip: presets for the loaded robot, rebuilt from the pose you are in. */
import { enforceLimits } from '../../../core/chain/limbs/limits';
import { pendulumMotions } from '../../../core/motion/generators/double-pendulum';
import { isPendulum } from '../../../core/robot/config/pendulum';
import { presetsFor } from '../../../core/motion/presets';
import type { MotionClip, MotionPreset } from '../../../core/motion/types';
import type { RobotSession } from '../../robots/session';
import gaits from '../../../core/motion/stepping/gaits.json';
import { footingOf } from './footing';

const SAMPLES = 120;
const SIZES = [1, 0.8, 0.6, 0.45, 0.3, 0.2];
/** Milliseconds of rebuilding before settling for the size reached: a whole-body clip costs too much to try them all at a click. */
const BUDGET = 400;

/** The largest clip that stays clear of contact, as the default trajectory is fitted; the playback stop still guards it. */
export function clearClip(s: RobotSession, p: MotionPreset, q: number[], size: number): MotionClip {
  const c = s.collision;
  // Hands play choreography, which must not be rescaled; a pose already touching has nothing to clear.
  if (!c || s.prosthesis || c.hit(q)) return p.build(s, q, size);
  const start = performance.now();
  let clip = p.build(s, q, size);
  for (const k of SIZES) {
    if (k < 1 && performance.now() - start > BUDGET) break;
    if (k < 1) clip = p.build(s, q, size * k);
    const span = clip.period + (clip.lead ?? 0);
    const touches = Array.from({ length: SAMPLES }, (_, i) => (span * i) / SAMPLES).some((t) => c.hit(enforceLimits(s.joints, clip.at(t))));
    if (!touches) break;
  }
  return clip;
}

export class MotionPlayer {
  presets: MotionPreset[] = [];
  clip: MotionClip | null = null;
  /** Presets other controllers offer for robots they can drive, such as the Rubik's cube for a Shadow hand. */
  readonly extras: ((s: RobotSession) => MotionPreset[])[] = [];
  private built = '';

  load(s: RobotSession, q: number[]): void {
    // A hand's motions come from the grasp controller, as extras.
    this.presets = this.offered(s, q);
    this.presets.push(...this.extras.flatMap((f) => f(s)));
    this.clip = null;
    this.built = '';
  }

  /** Build once per (preset, size, starting pose); a new pose or size makes a new clip. */
  ensure(s: RobotSession, preset: string | null, size: number, q: number[]): MotionClip | null {
    const p = this.presets.find((x) => x.id === preset);
    if (!p) return (this.clip = null);
    const key = `${s.id}|${p.id}|${size.toFixed(2)}|${q.map((v) => v.toFixed(3)).join(',')}`;
    if (key !== this.built) {
      this.built = key;
      try {
        this.clip = clearClip(s, p, q, size);
      } catch (e) {
        console.error(`motion ${p.id} for ${s.id}`, e);
        this.clip = null;
        // It cannot be played on this body, so it is not offered again.
        this.presets = this.presets.filter((x) => x !== p);
      }
    }
    return this.clip;
  }

  /** This runs while a robot opens: a motion that cannot be worked out costs that motion, never the page. */
  private offered(s: RobotSession, q: number[]): MotionPreset[] {
    try {
      if (isPendulum(s.spec)) return pendulumMotions(s.spec!);
      return s.prosthesis ? [] : presetsFor(s, q, s.category, { footing: () => footingOf(s), rungs: (gaits as Record<string, Record<string, number | null>>)[s.id] });
    } catch (e) {
      console.error(`motion presets for ${s.id}`, e);
      return [];
    }
  }
}
